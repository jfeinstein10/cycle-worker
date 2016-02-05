'use strict';

const Rx = require('rx');
const { run } = require('@cycle/core');
const { h1 } = require('@cycle/dom');
const VNode = require('virtual-dom/vnode/vnode');
const diff = require('virtual-dom/diff');
const fromJson = require('vdom-as-json/fromJson');
const serializePatch = require('vdom-serialized-patch/serialize');

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
    self.postMessage(data);
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

const makeWorkerDriver = function () {
  const selfObserver$ = observerFromSelf();
  const self$ = observableFromSelf().map((e) => e.data);
  const init$ = self$.filter((data) => data.type === 'init').
    map((data) => fromJson(data.data));
  const events$ = self$.filter((data) => data.type === 'event').
    map((data) => data.data).
    do(() => {
      // TODO map id to internal id and trigger event callback
    });

  init$.subscribe();
  events$.subscribe();

  return function workerDriver (vtree$) {
    // Parse the vtree and extract events
    // Pass the serialized patch
    const output$ = init$.first().
      concat(vtree$).
      flatMapLatest(transposeVTree).
      pairwise().
      flatMap(([ prevVTree, nextVTree ]) => {
        // TODO add id's to nextVTree and store event callbacks
        const patch = serializePatch(diff(prevVTree, nextVTree));

        selfObserver$.onNext(message('patch', patch));
        return Rx.Observable.just(nextVTree);
      });

    output$.subscribe();
    return {
      observable: output$,
      select: null
    };
  };
};

const main = function ({ DOM }) {
  return {
    DOM: Rx.Observable.interval(1000).
      map((i) => {
        return h1([ `${i} seconds elapsed`, h1('Foo') ]);
      })
  };
};

const drivers = {
  DOM: makeWorkerDriver()
};

run(main, drivers);
