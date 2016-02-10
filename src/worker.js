'use strict';

const _ = require('underscore');
const Rx = require('rx');
const { run } = require('@cycle/core');
const { h1 } = require('@cycle/dom');
const VNode = require('virtual-dom/vnode/vnode');
const diff = require('virtual-dom/diff');
const fromJson = require('vdom-as-json/fromJson');
const serializePatch = require('vdom-serialized-patch/serialize');
const select = require("vtree-select");

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

const transposeVTree = function (vtree) {
  if (typeof vtree.subscribe === 'function') {
    return vtree.flatMapLatest(transposeVTree);
  } else if (vtree.type === 'VirtualText') {
    return Rx.Observable.just(vtree);
  } else if (vtree.type === 'VirtualNode' && Array.isArray(vtree.children) && vtree.children.length > 0) {
    return Rx.Observable.combineLatest(vtree.children.map(transposeVTree), function () {
      let arr, key, len;

      for (len = arguments.length, arr = Array(len), key = 0; key < len; key++) {
        arr[key] = arguments[key];
      }
      return new VNode(vtree.tagName, vtree.properties, arr, vtree.key, vtree.namespace);
    });
  } else if (vtree.type === 'VirtualNode' || vtree.type === 'Widget' || vtree.type === 'Thunk') {
    return Rx.Observable.just(vtree);
  } else {
    throw new Error('Unhandled case in transposeVTree()');
  }
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

const modifyEvents = function (events, vtree, id) {
  const callbacks = {};
  const eventsList = [];

  vtree.properties.attributes = vtree.properties.attributes || {};
  _.each(vtree.properties.attributes, function (callback, name) {
    if (typeof name === 'string' && name.startsWith('on')) {
      eventsList.push(name);
      callbacks[name] = callback;
      delete vtree.properties.attributes[name];
    }
  });
  if (eventsList.length > 0) {
    vtree.properties.attributes['cycle-id'] = id;
    vtree.properties.attributes['cycle-events'] = eventsList.join(' ');
    events.set(id, callbacks);
  }
  vtree.children.forEach(function (child, ix) {
    if (child instanceof VNode) {
      modifyEvents(events, child, `${id}${ix}`);
    }
  });
};

const makeEventsSelector = function (rootEl$) {
  return (eventName) => {
    if (typeof eventName !== `string`) {
      throw new Error(`DOM driver's events() expects argument to be a ` +
        `string representing the event type to listen for.`);
    }
    // TODO (jf) simulate bubbling!

    return rootEl$.
      first().
      flatMapLatest(rootEl => {
        return fromEvent(rootEl, eventName);
      }).
      share();
  };
};

const makeElementSelector = function (rootEl$, namespace) {
  return (selector) => {
    if (typeof selector !== `string`) {
      throw new Error(`DOM driver's select() expects the argument to be a ` +
        `string as a CSS selector`);
    }
    selector = selector.trim();
    if (selector !== `:root`) {
      namespace = namespace.concat(selector);
    }
    const element$ = rootEl$.map((rootEl) => {
      return select(selector, rootEl.join(` `));
    });

    return {
      observable: element$,
      select: makeElementSelector(rootEl$, namespace),
      events: makeEventsSelector(rootEl$)
    };
  };
};

const makeWorkerDriver = function () {
  const selfObserver$ = observerFromSelf();
  const events = new Map();
  const id = guid();
  const self$ = observableFromSelf().map((e) => e.data);
  const init$ = self$.filter((data) => data.type === 'init').
    map((data) => fromJson(data.data));
  const events$ = self$.filter((data) => data.type === 'event').
    map((data) => data.data).
    do((data) => {
      // TODO map id to internal id and trigger event callback
      const callbackKey = `on${data.event.type}`;

      if (events.has(data.id) && events.get(data.id)[callbackKey]) {
        events.get(data.id)[callbackKey](data.event);
      }
    });

  init$.subscribe();
  events$.subscribe();

  return function workerDriver (vtree$) {
    // Parse the vtree and extract events
    // Pass the serialized patch
    const rootEl$ = init$.first().
      concat(vtree$).
      flatMapLatest(transposeVTree).
      pairwise().
      flatMap(([ prevVTree, nextVTree ]) => {
        // TODO add id's to nextVTree and store event callbacks
        modifyEvents(events, nextVTree, `${id}-0`);
        const patch = serializePatch(diff(prevVTree, nextVTree));

        selfObserver$.onNext(message('patch', patch));
        return Rx.Observable.just(nextVTree);
      });

    rootEl$.subscribe();
    return {
      observable: rootEl$,
      select: makeElementSelector(rootEl$, []),
      events: makeEventsSelector(rootEl$)
    };
  };
};

const main = function ({ DOM }) {
  return {
    DOM: Rx.Observable.interval(1000).
      map((i) => {
        return h1({
          attributes: {
            onclick: (e) => {
              console.log(e);
            },
            onmouseover: (e) => {
              console.log(e);
            }
          }
        },
        [ `${i} seconds elapsed`, h1('Foo') ]);
      })
  };
};

const drivers = {
  DOM: makeWorkerDriver()
};

run(main, drivers);
