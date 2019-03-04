import React from "react";

import { Provider } from "react-redux";
import { mount } from "enzyme";

import reducers from "metabase/reducers-main";
import { getStore } from "metabase/store";
import { delay } from "metabase/lib/promise";

// misc export aliases
export { delay } from "metabase/lib/promise";

import { MockResponse, MockRequest } from "xhr-mock";

// helper for JSON responses, also defaults to 200 status code
MockResponse.prototype.json = function(object) {
  return this.status(this._status || 200)
    .header("Content-Type", "application/json")
    .body(JSON.stringify(object));
};
MockRequest.prototype.json = function() {
  return JSON.parse(this.body());
};

export function getTestStore(reducers) {
  const actions = [];
  const reducerSpy = (state, action) => actions.push(action);

  const store = getStore({ ...reducers, reducerSpy });

  store.getActions = () => actions;
  store.waitForAction = function(type) {
    return new Promise(resolve => {
      let existingActionsCount = actions.length;
      const unsubscribe = store.subscribe(() => {
        const newActions = actions.slice(existingActionsCount);
        const action = newActions.find(action => action.type === type);
        if (action) {
          unsubscribe();
          resolve(action);
        } else {
          existingActionsCount = actions.length;
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
  // eslint-disable-next-line no-constant-condition
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

export async function getFormValues(wrapper) {
  const values = {};
  const inputs = await wrapper.async.find("input");
  for (const input of inputs) {
    values[input.props.name] = input.props.value;
  }
  return values;
}

export async function fillFormValues(wrapper, values) {
  const inputs = await wrapper.async.find("input");
  for (const input of inputs) {
    const name = input.props.name;
    if (name in values) {
      input.props.onChange(values[name]);
    }
  }
}

export function submitForm(wrapper) {
  wrapper
    .find("form")
    .first()
    .props()
    .onSubmit();
}

export async function fillAndSubmitForm(wrapper, values) {
  await fillFormValues(wrapper, values);
  submitForm(wrapper);
}
