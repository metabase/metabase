import { act } from "@testing-library/react";

import { renderHookWithProviders } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";

import { encodeSettings } from "./url-state";
import { useStoredSettings } from "./use-stored-settings";

type TestSettings = {
  granularity: string;
  counting: string;
};

const PATH = "/product-analysis/new";
const SEARCH = "?kind=habit&table=1";

type SetupOpts = {
  hash?: string;
};

const setup = ({ hash = "" }: SetupOpts = {}) => {
  const { result, router } = renderHookWithProviders(
    () => useStoredSettings<TestSettings>(),
    { withRouter: true, initialRoute: `${PATH}${SEARCH}${hash}` },
  );
  const testRouter = checkNotNull(router);
  const getHash = () => testRouter.location.hash.replace(/^#/, "");
  return { result, router: testRouter, getHash };
};

describe("useStoredSettings", () => {
  it("has no stored settings without a hash", () => {
    const { result } = setup();

    expect(result.current.storedSettings).toEqual({});
  });

  it("reads the stored settings from the hash", () => {
    const stored = { granularity: "week" };
    const { result } = setup({ hash: `#${encodeSettings(stored)}` });

    expect(result.current.storedSettings).toEqual(stored);
  });

  it("ignores a broken hash", () => {
    const { result } = setup({ hash: "#not-settings" });

    expect(result.current.storedSettings).toEqual({});
  });

  it("writes each change to the hash, keeping the path and query string", () => {
    const { result, router, getHash } = setup();

    act(() => result.current.onChangeSettings({ granularity: "week" }));
    act(() => result.current.onChangeSettings({ counting: "session" }));

    const stored = { granularity: "week", counting: "session" };
    expect(result.current.storedSettings).toEqual(stored);
    expect(getHash()).toBe(encodeSettings(stored));
    expect(router.location.pathname).toBe(PATH);
    expect(router.location.search).toBe(SEARCH);
  });

  it("steps through changes with browser back and forward", () => {
    const { result, router, getHash } = setup();

    act(() => result.current.onChangeSettings({ granularity: "week" }));
    act(() => result.current.onChangeSettings({ granularity: "month" }));

    act(() => router.back());
    expect(result.current.storedSettings).toEqual({ granularity: "week" });

    act(() => router.back());
    expect(result.current.storedSettings).toEqual({});
    expect(getHash()).toBe("");

    act(() => router.forward());
    expect(result.current.storedSettings).toEqual({ granularity: "week" });

    act(() => router.forward());
    expect(result.current.storedSettings).toEqual({ granularity: "month" });
    expect(getHash()).toBe(encodeSettings({ granularity: "month" }));
  });

  it("doesn't add a history entry for a change that changes nothing", () => {
    const { result, router } = setup();

    act(() => result.current.onChangeSettings({ granularity: "week" }));
    act(() => result.current.onChangeSettings({ granularity: "week" }));

    act(() => router.back());
    expect(result.current.storedSettings).toEqual({});
  });
});
