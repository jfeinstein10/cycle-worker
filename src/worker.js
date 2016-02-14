'use strict';

const Rx = require('rx');
const { run } = require('@cycle/core');
const { div, h1, button, input } = require('@cycle/dom');
const { makeWorkerDriver } = require('./cycle-worker');

const main = function ({ DOM }) {
  const input$ = DOM.select(`#input`).events(`input`).map((e) => e.value).
    startWith(``);
  const btn$ = DOM.select(`.btn`).events(`click`).map(() => 1).
    startWith(0).
    scan((x, y) => {
      return x + y;
    });
  const vtree$ = Rx.Observable.combineLatest(input$, btn$).map(([ v, i ]) => {
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
