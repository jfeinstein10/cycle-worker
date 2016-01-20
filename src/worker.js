import Rx from 'rx';
import {run} from '@cycle/core';
import {h1} from '@cycle/dom';
import VNode from 'virtual-dom/vnode/vnode';
import diff from 'virtual-dom/diff';
import fromJson from 'vdom-as-json/fromJson';
import serializePatch from 'vdom-serialized-patch/serialize';

function message(type, data) {
  return {type, data};
}

function transposeVTree(vtree) {
  if (typeof vtree.subscribe === "function") {
    return vtree.flatMapLatest(transposeVTree);
  } else if (vtree.type === "VirtualText") {
    return Rx.Observable.just(vtree);
  } else if (vtree.type === "VirtualNode" && Array.isArray(vtree.children) && vtree.children.length > 0) {
    return Rx.Observable.combineLatest(vtree.children.map(transposeVTree), function () {
      for (var _len = arguments.length, arr = Array(_len), _key = 0; _key < _len; _key++) {
        arr[_key] = arguments[_key];
      }
      return new VNode(vtree.tagName, vtree.properties, arr, vtree.key, vtree.namespace);
    });
  } else if (vtree.type === "VirtualNode" || vtree.type === "Widget" || vtree.type === "Thunk") {
    return Rx.Observable.just(vtree);
  } else {
    throw new Error("Unhandled case in transposeVTree()");
  }
}

function observerFromSelf() {
  // Create observer to handle sending messages
  return Rx.Observer.create((data) => {
    self.postMessage(data);
  });
}

function observableFromSelf() {
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
}

function makeWorkerDriver() {
  let selfObserver$ = observerFromSelf();
  let self$ = observableFromSelf().map((e) => e.data);
  let init$ = self$.filter((data) => data.type === 'init')
    .map((data) => fromJson(data.data));
  init$.subscribe();
  let events$ = self$.filter((data) => data.type === 'event')
    .map((data) => data.data)
    .do((e) => {
      // TODO map id to internal id and trigger event callback
      console.log(e);
    });
  events$.subscribe();

  return function workerDriver(vtree$) {
    // Parse the vtree and extract events
    // Pass the serialized patch
    let output$ = init$.first()
      .concat(vtree$)
      .flatMapLatest(transposeVTree)
      .pairwise()
      .flatMap(([prevVTree, nextVTree]) => {
        // TODO add id's to nextVTree and store event callbacks
        let patch = serializePatch(diff(prevVTree, nextVTree));
        selfObserver$.onNext(message('patch', patch));
        return Rx.Observable.just(nextVTree);
      });
    output$.subscribe();
    return {
      observable: output$,
      select: null
    };
  };
}

function main({DOM}) {
  console.log(DOM);
  return {
    DOM: Rx.Observable.interval(1000)
      .map((i) => {
        return h1([`${i} seconds elapsed`, h1('Foo')]);
      })
  };
}

const drivers = {
  DOM: makeWorkerDriver()
};

run(main, drivers);
