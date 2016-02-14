'use strict';

const _ = require('underscore');
const Rx = require('rx-dom');
const { VNode, VText } = require('virtual-dom');
const initializeConverter = require('html-to-vdom');
const { patch } = require('vdom-serialized-patch');
const { toJson } = require('vdom-as-json');

const message = function (type, data) {
  return { type, data };
};

const workerRun = function (container, script) {
  let domContainer = typeof container === 'string' ?
    document.querySelector(container) :
    container;
  const worker$ = Rx.DOM.fromWorker(script);
  let eventStreamSubscription;

  // Send all events on the container to the worker
  const registerEvents = function (node) {
    const eventNodes = Array.prototype.slice.call(node.querySelectorAll('[cycle-events]'));

    if (node.getAttribute('cycle-events')) {
      eventNodes.push(node);
    }
    const eventObservables = _.flatten(_.map(eventNodes, (eventNode) => {
      const events = eventNode.getAttribute('cycle-events');

      return _.map(events.split(' '), (event) => Rx.Observable.fromEvent(eventNode, event));
    }));
    const eventStream$ = Rx.Observable.merge(eventObservables).map((e) => {
      return {
        id: e.target.getAttribute('cycle-id'),
        type: e.type,
        value: e.target.value
      };
    });

    eventStreamSubscription = eventStream$.subscribe((data) => {
      worker$.onNext(message('event', data));
    });
  };

  const unregisterEvents = function () {
    if (eventStreamSubscription) {
      eventStreamSubscription.dispose();
    }
  };

  // Respond to messages from the worker
  const handlers = {
    patch: (data) => {
      unregisterEvents();
      domContainer = patch(domContainer, data);
      registerEvents(domContainer);
    }
  };

  worker$.subscribe((e) => {
    handlers[e.data.type](e.data.data);
  }, (e) => {
    console.log(e);
  });

  // Send the initial contents of the container
  const convertHTML = initializeConverter({ VNode, VText });
  const contents = toJson(convertHTML(domContainer.innerHTML));

  worker$.onNext(message('init', contents));
};

workerRun('#app', '/dist/worker.js');
