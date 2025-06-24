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

    describe("entity_types", () => {
      it('should accept multiple "entity_types" options', () => {
        const store = createMockStore();

        store.dispatch(
          setInitialUrlOptions({
            search: "entity_types=table&entity_types=model",
          }),
        );

        // The default value is `["model", "table"]`, so we know these 2 types are set correctly.
        expect(store.getState().embed.options.entity_types).toEqual([
          "table",
          "model",
        ]);
      });

      it('should accept single "entity_types" option', () => {
        const store = createMockStore();

        store.dispatch(
          setInitialUrlOptions({
            search: "entity_types=model",
          }),
        );

        expect(store.getState().embed.options.entity_types).toEqual(["model"]);
      });

      it('should accept comma separated "entity_types" option', () => {
        const store = createMockStore();

        store.dispatch(
          setInitialUrlOptions({
            search: "entity_types=model,table",
          }),
        );

        expect(store.getState().embed.options.entity_types).toEqual([
          "model",
          "table",
        ]);
      });

      it('should accept comma separated "entity_types" option with space', () => {
        const store = createMockStore();

        store.dispatch(
          setInitialUrlOptions({
            search: "entity_types= table , model",
          }),
        );

        expect(store.getState().embed.options.entity_types).toEqual([
          "table",
          "model",
        ]);
      });

      it('should ignore invalid "entity_types" option', () => {
        const store = createMockStore();

        store.dispatch(
          setInitialUrlOptions({
            search: "entity_types=not_a_valid_type",
          }),
        );

        // Default value
        expect(store.getState().embed.options.entity_types).toEqual([
          "model",
          "table",
        ]);
      });

      it('should set "entity_types" option to the default value `["model", "table"]` when "entity_types" are empty', () => {
        const store = createMockStore();

        store.dispatch(
          setInitialUrlOptions({
            search: "entity_types=",
          }),
        );

        // Default value
        expect(store.getState().embed.options.entity_types).toEqual([
          "model",
          "table",
        ]);

        store.dispatch(
          setInitialUrlOptions({
            search: "",
          }),
        );

        // Default value
        expect(store.getState().embed.options.entity_types).toEqual([
          "model",
          "table",
        ]);
      });

      it('should ignore "entity_types" that is not the first option when the first option has comma', () => {
        const store = createMockStore();

        store.dispatch(
          setInitialUrlOptions({
            search: "entity_types= table, invalid&entity_types=model",
          }),
        );

        // Default value
        expect(store.getState().embed.options.entity_types).toEqual(["table"]);
      });
    });
  });
});

const createMockStore = () => {
  const store = configureStore({
    reducer: { embed: embedReducer },
  });
  return store as typeof store & { dispatch: Dispatch };
};
