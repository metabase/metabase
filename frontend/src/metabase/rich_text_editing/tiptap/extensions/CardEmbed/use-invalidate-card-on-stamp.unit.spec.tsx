import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";

import { getStore } from "__support__/entities-store";
import { Api } from "metabase/api";
import { MetabaseReduxProvider } from "metabase/utils/redux";

import { useInvalidateCardOnStamp } from "./use-invalidate-card-on-stamp";

function wrapper({ children }: { children: ReactNode }) {
  const store = getStore();
  return (
    <MetabaseReduxProvider store={store}>{children}</MetabaseReduxProvider>
  );
}

describe("useInvalidateCardOnStamp", () => {
  const spy = jest.spyOn(Api.util, "invalidateTags");

  beforeEach(() => {
    spy.mockClear();
  });

  afterAll(() => {
    spy.mockRestore();
  });

  it("does not invalidate on initial render", () => {
    renderHook(
      () =>
        useInvalidateCardOnStamp({ id: 7, updatedAt: 100, skip: false }),
      { wrapper },
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it("invalidates the card tag when updatedAt changes", () => {
    const { rerender } = renderHook(
      ({ updatedAt }: { updatedAt: number | null }) =>
        useInvalidateCardOnStamp({ id: 7, updatedAt, skip: false }),
      { wrapper, initialProps: { updatedAt: 100 as number | null } },
    );

    rerender({ updatedAt: 200 });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith([{ type: "card", id: 7 }]);
  });

  it("does not invalidate when updatedAt is unchanged", () => {
    const { rerender } = renderHook(
      ({ updatedAt }: { updatedAt: number | null }) =>
        useInvalidateCardOnStamp({ id: 7, updatedAt, skip: false }),
      { wrapper, initialProps: { updatedAt: 100 as number | null } },
    );

    rerender({ updatedAt: 100 });

    expect(spy).not.toHaveBeenCalled();
  });

  it("does not invalidate when skipped (e.g. public document)", () => {
    const { rerender } = renderHook(
      ({ updatedAt }: { updatedAt: number | null }) =>
        useInvalidateCardOnStamp({ id: 7, updatedAt, skip: true }),
      { wrapper, initialProps: { updatedAt: 100 as number | null } },
    );

    rerender({ updatedAt: 200 });

    expect(spy).not.toHaveBeenCalled();
  });

  it("does not invalidate when id is missing", () => {
    const { rerender } = renderHook(
      ({ updatedAt }: { updatedAt: number | null }) =>
        useInvalidateCardOnStamp({ id: null, updatedAt, skip: false }),
      { wrapper, initialProps: { updatedAt: 100 as number | null } },
    );

    rerender({ updatedAt: 200 });

    expect(spy).not.toHaveBeenCalled();
  });
});
