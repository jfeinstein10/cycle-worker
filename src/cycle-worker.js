'use strict';

const Rx = require('rx');
const { transposeVTree } = require('@cycle/dom/lib/transposition');
const { diff } = require('virtual-dom');
const fromJson = require('vdom-as-json/fromJson');
const { serialize } = require('vdom-serialized-patch');
const select = require('vtree-select');

const guid = function () {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);

    return v.toString(16);
  });
};

const message = function (type, data) {
  return { type, data };
};

const addCycleIds = function (vtree, id) {
  if (vtree.properties.attributes && vtree.properties.attributes['cycle-events']) {
    vtree.properties.attributes['cycle-id'] = id;
  }
  vtree.children.forEach(function (child, ix) {
    if (child.type === 'VirtualNode') {
      addCycleIds(child, `${id}${ix}`);
    }
  });
};

const observerFromSelf = function () {
  // Create observer to handle sending messages
  return Rx.Observer.create((data) => {
    try {
      self.postMessage(data);
    } catch (err) {
      console.log(err);
    }
  });
};

const observableFromSelf = function () {
  // Create observable to handle the messages
  return Rx.Observable.create((obs) => {
    self.addEventListener('message', (data) => {
      obs.onNext(data);
    });
    self.addEventListener('error', (err) => {
      obs.onError(err);
    });
    return () => {};
  });
};

const makeEventsSelector = function (rootEl$, events$, namespace) {
  return (eventName) => {
    if (typeof eventName !== `string`) {
      throw new Error(`DOM driver's events() expects argument to be a ` +
        `string representing the event type to listen for.`);
    }
    // TODO (jf) simulate bubbling!
    return rootEl$.
      map((rootEl) => {
        return select(namespace.join(` `))(rootEl);
      }).
      filter((elements) => {
        return elements !== null;
      }).
      flatMapLatest((elements) => {
        if (elements.type === 'VirtualNode') {
          elements = [ elements ];
        }
        return Rx.Observable.merge(elements.map((element) => {
          const id = element.properties.attributes['cycle-id'];

          return events$.filter((data) => {
            return data.id === id && data.type === eventName;
          });
        }));
      }).share();
  };
};

const makeElementSelector = function (rootEl$, events$, namespace) {
  return (selector) => {
    if (typeof selector !== `string`) {
      throw new Error(`DOM driver's select() expects the argument to be a ` +
        `string as a CSS selector`);
    }
    const innerNamespace = namespace.slice(0);

    selector = selector.trim();
    if (selector !== `:root`) {
      innerNamespace.push(selector);
    }
    const element$ = rootEl$.map((rootEl) => {
      return select(innerNamespace.join(` `))(rootEl);
    });

    return {
      observable: element$,
      select: makeElementSelector(rootEl$, events$, innerNamespace),
      events: makeEventsSelector(rootEl$, events$, innerNamespace)
    };
  };
};

const makeWorkerDriver = function () {
  const selfObserver$ = observerFromSelf();
  const id = guid();
  const self$ = observableFromSelf().map((e) => e.data);
  const init$ = self$.filter((data) => data.type === 'init').
    map((data) => fromJson(data.data)).first();
  const events$ = self$.filter((data) => data.type === 'event').
    map((data) => data.data);

  return function workerDriver (vtree$) {
    // Parse the vtree and extract events
    // Pass the serialized patch
    const rootEl$ = init$.
      concat(vtree$).
      flatMapLatest(transposeVTree).
      map((vtree) => {
        addCycleIds(vtree, `${id}-0`);
        return vtree;
      }).
      pairwise().
      flatMap(([ prevVTree, nextVTree ]) => {
        const patch = serialize(diff(prevVTree, nextVTree));

        selfObserver$.onNext(message('patch', patch));
        return Rx.Observable.just(nextVTree);
      });
    const disposable = rootEl$.subscribe();

    // events$.subscribe();
    return {
      observable: rootEl$,
      dispose: () => {
        disposable.dispose();
      },
      select: makeElementSelector(rootEl$, events$, []),
      events: makeEventsSelector(rootEl$, events$, [])
    };
  };
};

module.exports = {
  makeWorkerDriver
};
