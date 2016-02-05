'use strict';

const _ = require('underscore');
const Rx = require('rx-dom');
const VNode = require('virtual-dom/vnode/vnode');
const VText = require('virtual-dom/vnode/vtext');
const initializeConverter = require('html-to-vdom');
const applyPatch = require('vdom-serialized-patch/patch');
const toJson = require('vdom-as-json/toJson');

const events = `blur focus focusin focusout load resize scroll unload click
 dblclick mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave
 change select submit keydown keypress keyup error contextmenu
 pointerdown pointerup pointermove pointerover pointerout pointerenter
 pointerleave touchstart touchend touchmove touchcancel`;

const message = function (type, data) {
  return { type, data };
};

const workerRun = function (container, script) {
  let domContainer = typeof container === 'string' ?
    document.querySelector(container) :
    container;
  const worker$ = Rx.DOM.fromWorker(script);

  // Send all events on the container to the worker
  const registerEvents = function (node) {
    const eventObservables = events.split(' ').map((event) => {
      return Rx.Observable.fromEvent(node, event);
    });

    Rx.Observable.merge(eventObservables).map((e) => {
      const object = _.object(_.chain(e).
        allKeys().
        filter((key) => !_.isObject(e[key])).
        map((key) => [ key, e[key] ]).
        value());

      return object;
    }).doOnNext((e) => {
      worker$.onNext(message('event', e));
    }).subscribe();
  };

  registerEvents(domContainer);

  // Respond to messages from the worker
  const handlers = {
    patch: (data) => {
      domContainer = applyPatch(domContainer, data);
      registerEvents(domContainer);
    }
  };

  worker$.subscribe((e) => {
    handlers[e.data.type](e.data.data);
  });

  // Send the initial contents of the container
  const convertHTML = initializeConverter({ VNode, VText });
  const contents = toJson(convertHTML(domContainer.innerHTML));

  worker$.onNext(message('init', contents));
};

workerRun('#app', '/dist/worker.js');
