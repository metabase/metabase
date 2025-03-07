import { type Dispatch, configureStore } from "@reduxjs/toolkit";

import {
  DEFAULT_INTERACTIVE_EMBEDDING_OPTIONS,
  embed as embedReducer,
  setInitialUrlOptions,
} from "./embed";

describe("embed reducer", () => {
  describe("setInitialUrlOptions", () => {
    it("should set default options", () => {
      const store = createMockStore();

      store.dispatch(setInitialUrlOptions({ search: "" }));

      expect(store.getState().embed.options).toEqual(
        DEFAULT_INTERACTIVE_EMBEDDING_OPTIONS,
      );
    });

    it("should set options from search", () => {
      const store = createMockStore();

      store.dispatch(
        setInitialUrlOptions({ search: "top_nav=false&new_button=true" }),
      );

      expect(store.getState().embed.options.top_nav).toBe(false);
      expect(store.getState().embed.options.new_button).toBe(true);
    });

    it("should ignore invalid options", () => {
      const store = createMockStore();

      store.dispatch(
        setInitialUrlOptions({ search: "top_nav=false&invalid_option=123" }),
      );

      expect(store.getState().embed.options).not.toHaveProperty(
        "invalid_option",
      );
    });
  });
});

const createMockStore = () => {
  const store = configureStore({
    reducer: { embed: embedReducer },
  });
  return store as typeof store & { dispatch: Dispatch };
};
