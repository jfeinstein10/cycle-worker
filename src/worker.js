'use strict';

const Rx = require('rx');
const { run } = require('@cycle/core');
const { div, h1, button } = require('@cycle/dom');
const { makeWorkerDriver } = require('./cycle-worker');

const main = function ({ DOM }) {
  const initialValue$ = Rx.Observable.just(0);
  const newValue$ = DOM.select(`.btn`).events(`click`).map((e) => {
    return 1;
  });
  const value$ = initialValue$.concat(newValue$).scan((x, y) => {
    return x + y;
  });
  // const interval$ = Rx.Observable.interval(1000).map(i => `${i}`);
  const vtree$ = value$.map((i) => {
    return div([
      h1(`${i} clicks`),
      button(`.btn`, {
        attributes: {
          'cycle-events': 'click'
        }
      }, `Click me!`)
    ]);
  });
  vtree$.subscribe();

  return {
    DOM: vtree$
  };
};

const drivers = {
  DOM: makeWorkerDriver()
};

run(main, drivers);
