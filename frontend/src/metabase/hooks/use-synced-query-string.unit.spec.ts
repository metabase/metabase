import { renderHook } from "@testing-library/react-hooks";

import { useSyncedQueryString } from "./use-synced-query-string";

describe("useSyncedQueryString", () => {
  it("should update the query string when the object changes", () => {
    const spy = jest.spyOn(history, "replaceState");
    let object: object = { foo: 42 };
    const { rerender, unmount } = renderHook(() =>
      useSyncedQueryString(object),
    );

    expect(spy).not.toHaveBeenCalledWith("/");
    expect(spy).toHaveBeenLastCalledWith(null, "", "/?foo=42");

    object = { foo: 42, bar: "baz" };
    rerender();
    expect(spy).not.toHaveBeenCalledWith("/");
    expect(spy).toHaveBeenLastCalledWith(null, "", "/?foo=42&bar=baz");

    unmount();
    expect(spy).toHaveBeenLastCalledWith(null, "", "/");
  });

  it("should override previous values with the same key", () => {
    const spy = jest.spyOn(history, "replaceState");
    let object: object = { foo: 42 };
    const { rerender, unmount } = renderHook(() =>
      useSyncedQueryString(object),
    );

    expect(spy).not.toHaveBeenCalledWith("/");
    expect(spy).toHaveBeenLastCalledWith(null, "", "/?foo=42");
    object = { foo: 43 };

    rerender();
    expect(spy).not.toHaveBeenCalledWith("/");
    expect(spy).toHaveBeenLastCalledWith(null, "", "/?foo=43");

    unmount();
    expect(spy).toHaveBeenLastCalledWith(null, "", "/");
  });

  it("should respect original query parameters when the object changes or when unmounting", () => {
    history.replaceState(null, "", "http://localhost/?objectId=123");

    const spy = jest.spyOn(history, "replaceState");
    let object: object = { foo: 42 };
    const { rerender, unmount } = renderHook(() =>
      useSyncedQueryString(object),
    );

    expect(spy).toHaveBeenLastCalledWith(null, "", "/?objectId=123&foo=42");
    object = { foo: 43 };

    rerender();
    expect(spy).toHaveBeenLastCalledWith(null, "", "/?objectId=123&foo=43");

    unmount();
    expect(spy).toHaveBeenLastCalledWith(null, "", "/?objectId=123");
  });
});
