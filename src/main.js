import Rx from 'rx';
import 'rx-dom';
import {makeDOMDriver} from '@cycle/dom';
import {parse} from 'virtual-dom';
import VNode from 'virtual-dom/vnode/vnode';
import VText from 'virtual-dom/vnode/vtext';
import initializeConverter from 'html-to-vdom';
import applyPatch from 'vdom-serialized-patch/patch';
import toJson from 'vdom-as-json/toJson';

const events = `blur focus focusin focusout load resize scroll unload click
 dblclick mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave
 change select submit keydown keypress keyup error contextmenu
 pointerdown pointerup pointermove pointerover pointerout pointerenter
 pointerleave touchstart touchend touchmove touchcancel`;

workerRun('#app', '/dist/worker.js');

function message(type, data) {
  return {type, data};
}

function workerRun(container, script) {
  let domContainer = typeof container === 'string' ?
    document.querySelector(container) :
    container;
  const worker$ = Rx.DOM.fromWorker(script);

  // Send all events on the container to the worker
  function registerEvents(container) {
    let eventObservables = events.split(' ').map((event) => {
      return Rx.Observable.fromEvent(container, event);
    });
    Rx.Observable.merge(eventObservables).map((e) => {
      let object = _.object(_.chain(e)
        .allKeys()
        .filter((key) => !_.isObject(e[key]))
        .map((key) => [key, e[key]])
        .value());
      return object;
    }).doOnNext((e) => {
      worker$.onNext(message('event', e));
    }).subscribe();
  }
  registerEvents(domContainer);

  // Respond to messages from the worker
  const handlers = {
    'patch': (data) => {
      domContainer = applyPatch(domContainer, data);
      registerEvents(domContainer);
    }
  };
  worker$.subscribe((e) => {
    handlers[e.data.type](e.data.data);
  }, console.log);

  // Send the initial contents of the container
  const convertHTML = initializeConverter({
    VNode: VNode,
    VText: VText
  });
  const contents = toJson(convertHTML(domContainer.innerHTML));
  worker$.onNext(message('init', contents));
}
