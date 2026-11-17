import { act } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import { PLUGIN_PERMISSION_PREVIEW } from "metabase/plugins";
import { useUserSetting } from "metabase/settings";

import { useNavSectionSetting } from "./use-nav-section-setting";

const SETTING_URL = "path:/api/setting/expand-bookmarks-in-nav";
const LATER_SETTING_URL = "path:/api/setting/expand-browse-in-nav";

describe("useNavSectionSetting", () => {
  const getActivePreviewUserId =
    PLUGIN_PERMISSION_PREVIEW.getActivePreviewUserId;

  beforeEach(() => {
    fetchMock.put(SETTING_URL, 204);
    fetchMock.put(LATER_SETTING_URL, 204);
  });

  afterEach(() => {
    PLUGIN_PERMISSION_PREVIEW.getActivePreviewUserId = getActivePreviewUserId;
  });

  it("collapses a section in a permissions preview without saving the setting", async () => {
    const { result } = setup({ previewUserId: 2 });

    act(() => result.current.section[1](false));
    // a save made after the collapse, with the same debounce: once it's sent, a save of the collapse would have been too
    act(() => result.current.laterSave[1](false));
    await waitFor(() =>
      expect(fetchMock.callHistory.called(LATER_SETTING_URL)).toBe(true),
    );

    expect(result.current.section[0]).toBe(false);
    expect(fetchMock.callHistory.called(SETTING_URL)).toBe(false);
  });

  it("saves the setting outside a preview (guard)", async () => {
    const { result } = setup({ previewUserId: null });

    act(() => result.current.section[1](false));

    await waitFor(() =>
      expect(fetchMock.callHistory.called(SETTING_URL)).toBe(true),
    );
  });
});

type SetupOpts = { previewUserId: number | null };

function setup({ previewUserId }: SetupOpts) {
  PLUGIN_PERMISSION_PREVIEW.getActivePreviewUserId = () => previewUserId;

  return renderHookWithProviders(
    () => ({
      section: useNavSectionSetting("expand-bookmarks-in-nav"),
      laterSave: useUserSetting("expand-browse-in-nav"),
    }),
    {
      storeInitialState: createMockState({
        settings: mockSettings({ "expand-bookmarks-in-nav": true }),
      }),
    },
  );
}
