'use strict';

const Rx = require('rx');
const { run } = require('@cycle/core');
const { div, h1, button, input } = require('@cycle/dom');
const { makeWorkerDriver } = require('./cycle-worker');

const main = function ({ DOM }) {
  const initialValue$ = Rx.Observable.just(0);
  const newValue$ = DOM.select(`.btn`).events(`click`).map((e) => {
    return 1;
  });
  const input$ = Rx.Observable.just(``).concat(DOM.select(`#input`).events(`input`).map((e) => {
    return e.value;
  }));
  const value$ = initialValue$.concat(newValue$).scan((x, y) => {
    return x + y;
  });
  const vtree$ = Rx.Observable.combineLatest(input$, value$).map(([v, i]) => {
    return div([
      h1(`${i} clicks`),
      h1(`${v}`),
      input(`#input`, {
        type: 'text',
        attributes: {
          'cycle-events': 'input'
        }
      }),
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
