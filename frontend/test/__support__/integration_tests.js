import React from "react";

import { Provider } from "react-redux";
import { mount } from "enzyme";

import reducers from "metabase/reducers-main";
import { getStore } from "metabase/store";
import { delay } from "metabase/lib/promise";

import { MockResponse } from "xhr-mock";

// helper for JSON responses, also defaults to 200 status code
MockResponse.prototype.json = function(object) {
  return this.status(this._status || 200)
    .header("Content-Type", "application/json")
    .body(JSON.stringify(object));
};

export function getTestStore(reducers) {
  const dispatchSpy = jest.fn(() => ({}));
  const reducerSpy = (state, action) => dispatchSpy(action);

  const store = getStore({ ...reducers, reducerSpy });

  store.waitForAction = function(type) {
    return new Promise(resolve => {
      let existingCallsCount = dispatchSpy.mock.calls.length;
      const unsubscribe = store.subscribe(() => {
        const newCalls = dispatchSpy.mock.calls.slice(existingCallsCount);
        if (newCalls.find(call => call[0].type === type)) {
          unsubscribe();
          resolve();
        } else {
          existingCallsCount = dispatchSpy.mock.calls.length;
        }
      });
    });
  };

  return store;
}

export function mountWithStore(element) {
  const store = getTestStore(reducers);

  const wrapper = mount(<Provider store={store}>{element}</Provider>);

  enhanceEnzymeWrapper(wrapper);

  // NOTE: automatically call wrapper.update when the store changes:
  // https://github.com/airbnb/enzyme/blob/ed5848085051ac7afef64a7d045d53b1153a8fe7/docs/guides/migration-from-2-to-3.md#for-mount-updates-are-sometimes-required-when-they-werent-before
  store.subscribe(() => wrapper.update());

  return { wrapper, store };
}

const TIMEOUT = 1000;

async function eventually(fn, timeout = TIMEOUT) {
  const start = Date.now();
  while (true) {
    try {
      return fn();
    } catch (e) {
      if (Date.now() - start > timeout) {
        throw e;
      } else {
        await delay(100);
      }
    }
  }
}

function enhanceEnzymeWrapper(wrapper) {
  // add a "async" namespace that wraps functions in `eventually`
  wrapper.async = {
    find: selector =>
      eventually(() => {
        const node = wrapper.find(selector);
        if (node.exists()) {
          return node;
        } else {
          throw new Error("Not found: " + selector);
        }
      }),
  };
  return wrapper;
}
