import { act } from "@testing-library/react";

import { renderHookWithProviders } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";

import type { StoredSettings } from "./settings/types";
import { encodeSettings } from "./url-state";
import { useAnalysisState } from "./use-analysis-state";

type TestSettings = {
  "funnel.view": string;
  counting: string;
};

const SAVED_SETTINGS: StoredSettings = { "funnel.view": "overTime" };

type SetupOpts = {
  savedSettings?: StoredSettings;
  hash?: string;
};

const setup = ({ savedSettings, hash = "" }: SetupOpts = {}) => {
  const { result, router } = renderHookWithProviders(
    () => useAnalysisState<TestSettings>(savedSettings),
    { withRouter: true, initialRoute: `/event-analysis/5${hash}` },
  );
  const testRouter = checkNotNull(router);
  const getHash = () => testRouter.location.hash.replace(/^#/, "");
  return { result, router: testRouter, getHash };
};

describe("useAnalysisState", () => {
  it("opens saved settings without writing them to the URL", () => {
    const { result, getHash } = setup({ savedSettings: SAVED_SETTINGS });

    expect(result.current.stored).toEqual(SAVED_SETTINGS);
    expect(getHash()).toBe("");
  });

  it("keeps unsaved edits in the hash until they match the saved settings", () => {
    const { result, getHash } = setup({ savedSettings: SAVED_SETTINGS });

    act(() => result.current.onChangeSettings({ counting: "session" }));
    expect(getHash()).toBe(
      encodeSettings({ "funnel.view": "overTime", counting: "session" }),
    );

    act(() => result.current.onChangeSettings({ counting: undefined }));
    expect(result.current.stored).toEqual(SAVED_SETTINGS);
    expect(getHash()).toBe("");
  });

  it("prefers unsaved edits in the hash over the saved settings", () => {
    const edits = { "funnel.view": "steps" };
    const { result } = setup({
      savedSettings: SAVED_SETTINGS,
      hash: `#${encodeSettings(edits)}`,
    });

    expect(result.current.stored).toEqual(edits);
  });

  it("clears the hash once the edits are saved", () => {
    const { result, getHash } = setup({ savedSettings: SAVED_SETTINGS });

    act(() => result.current.onChangeSettings({ counting: "event" }));
    expect(getHash()).not.toBe("");

    act(() => result.current.onSaved());
    expect(getHash()).toBe("");
    expect(result.current.stored).toEqual({
      "funnel.view": "overTime",
      counting: "event",
    });
  });

  it("tracks unsaved changes against the settings it last saved", () => {
    const { result } = setup({ savedSettings: SAVED_SETTINGS });
    expect(result.current.hasUnsavedChanges).toBe(false);

    act(() => result.current.onChangeSettings({ counting: "event" }));
    expect(result.current.hasUnsavedChanges).toBe(true);

    act(() => result.current.onSaved());
    expect(result.current.hasUnsavedChanges).toBe(false);

    act(() => result.current.onChangeSettings({ counting: undefined }));
    expect(result.current.stored).toEqual(SAVED_SETTINGS);
    expect(result.current.hasUnsavedChanges).toBe(true);
  });

  it("steps through edits with browser back and forward", () => {
    const { result, router } = setup({ savedSettings: SAVED_SETTINGS });

    act(() => result.current.onChangeSettings({ counting: "event" }));
    act(() => result.current.onChangeSettings({ counting: "session" }));

    act(() => router.back());
    expect(result.current.stored).toEqual({
      "funnel.view": "overTime",
      counting: "event",
    });
    expect(result.current.hasUnsavedChanges).toBe(true);

    act(() => router.back());
    expect(result.current.stored).toEqual(SAVED_SETTINGS);
    expect(result.current.hasUnsavedChanges).toBe(false);

    act(() => router.forward());
    act(() => router.forward());
    expect(result.current.stored).toEqual({
      "funnel.view": "overTime",
      counting: "session",
    });
  });

  it("doesn't add a history entry when nothing changed", () => {
    const { result, router } = setup({ savedSettings: SAVED_SETTINGS });
    const onLocationChange = jest.fn();
    router.onLocationChange(onLocationChange);

    act(() => result.current.onChangeSettings({ "funnel.view": "overTime" }));
    expect(onLocationChange).not.toHaveBeenCalled();
  });

  it("keeps an edit that clears every saved setting", () => {
    const { result, getHash } = setup({ savedSettings: SAVED_SETTINGS });

    act(() => result.current.onChangeSettings({ "funnel.view": undefined }));
    expect(result.current.stored).toEqual({});
    expect(result.current.hasUnsavedChanges).toBe(true);
    expect(getHash()).toBe(encodeSettings({}));
  });
});
