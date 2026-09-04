import { act, renderHook } from "@testing-library/react";

import type { FieldReference, ModelIndex } from "metabase-types/api";
import { createMockModelIndex } from "metabase-types/api/mocks";

import { useShouldIndex } from "./use-should-index";

const FIELD_NAME = "TITLE";
const FIELD_REF: FieldReference = ["field", 2, null];

const INDEXED = [createMockModelIndex({ value_ref: FIELD_REF })];
const NOT_INDEXED: ModelIndex[] = [];

type SetupOpts = {
  shouldIndex?: boolean;
  modelIndexes: ModelIndex[];
};

const setup = (initialProps: SetupOpts) =>
  renderHook(
    ({ shouldIndex, modelIndexes }: SetupOpts) =>
      useShouldIndex({
        field: {
          name: FIELD_NAME,
          field_ref: FIELD_REF,
          should_index: shouldIndex,
        },
        modelIndexes,
      }),
    { initialProps },
  );

describe("useShouldIndex", () => {
  it("should follow the model index list when the column has no unsaved change", () => {
    const { result, rerender } = setup({ modelIndexes: NOT_INDEXED });
    expect(result.current.shouldIndex).toBe(false);

    rerender({ modelIndexes: INDEXED });
    expect(result.current.shouldIndex).toBe(true);
  });

  it("should stay on while saving clears should_index before the index exists", () => {
    const { result, rerender } = setup({ modelIndexes: NOT_INDEXED });

    act(() => result.current.setShouldIndex(true));
    rerender({ shouldIndex: true, modelIndexes: NOT_INDEXED });
    expect(result.current.shouldIndex).toBe(true);

    // saving strips should_index, and the index does not exist yet
    rerender({ shouldIndex: undefined, modelIndexes: NOT_INDEXED });
    expect(result.current.shouldIndex).toBe(true);

    rerender({ shouldIndex: undefined, modelIndexes: INDEXED });
    expect(result.current.shouldIndex).toBe(true);
  });

  it("should stay off while saving clears should_index before the index is removed", () => {
    const { result, rerender } = setup({ modelIndexes: INDEXED });

    act(() => result.current.setShouldIndex(false));
    rerender({ shouldIndex: false, modelIndexes: INDEXED });
    expect(result.current.shouldIndex).toBe(false);

    // saving strips should_index, and the index is not deleted yet
    rerender({ shouldIndex: undefined, modelIndexes: INDEXED });
    expect(result.current.shouldIndex).toBe(false);

    rerender({ shouldIndex: undefined, modelIndexes: NOT_INDEXED });
    expect(result.current.shouldIndex).toBe(false);
  });

  it("should hand control back to the model index list once it catches up", () => {
    const { result, rerender } = setup({ modelIndexes: NOT_INDEXED });

    act(() => result.current.setShouldIndex(true));
    rerender({ shouldIndex: undefined, modelIndexes: INDEXED });
    expect(result.current.shouldIndex).toBe(true);

    rerender({ shouldIndex: undefined, modelIndexes: NOT_INDEXED });
    expect(result.current.shouldIndex).toBe(false);
  });

  it("should keep choices separate per column", () => {
    const otherFieldRef: FieldReference = ["field", 3, null];
    const { result, rerender } = renderHook(
      ({ name, fieldRef }: { name: string; fieldRef: FieldReference }) =>
        useShouldIndex({
          field: { name, field_ref: fieldRef, should_index: undefined },
          modelIndexes: NOT_INDEXED,
        }),
      { initialProps: { name: FIELD_NAME, fieldRef: FIELD_REF } },
    );

    act(() => result.current.setShouldIndex(true));
    expect(result.current.shouldIndex).toBe(true);

    rerender({ name: "SUBTITLE", fieldRef: otherFieldRef });
    expect(result.current.shouldIndex).toBe(false);

    rerender({ name: FIELD_NAME, fieldRef: FIELD_REF });
    expect(result.current.shouldIndex).toBe(true);
  });
});
