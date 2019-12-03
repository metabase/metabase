import React from "react";
import { Provider } from "react-redux";
import { mount } from "__support__/enzyme";

import reducers from "metabase/reducers-main";
import { getStore } from "metabase/store";

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

  // NOTE: automatically call wrapper.update when the store changes:
  // https://github.com/airbnb/enzyme/blob/ed5848085051ac7afef64a7d045d53b1153a8fe7/docs/guides/migration-from-2-to-3.md#for-mount-updates-are-sometimes-required-when-they-werent-before
  store.subscribe(() => wrapper.update());

  return { wrapper, store };
}
