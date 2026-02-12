import { renderHookWithProviders } from "__support__/ui";
import {
  DATA_STUDIO_UPGRADE_URL,
  UPGRADE_URL,
} from "metabase/admin/upsells/constants";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { useUpgradeAction } from "./use-upgrade-action";

type SetupOpts = {
  isHosted: boolean;
  url: string;
  campaign?: string;
  location?: string;
};

const setup = ({
  isHosted,
  url,
  campaign = "test",
  location = "test",
}: SetupOpts) => {
  return renderHookWithProviders(
    () =>
      useUpgradeAction({
        url,
        campaign,
        location,
      }),
    {
      storeInitialState: createMockState({
        settings: createMockSettingsState({
          "is-hosted?": isHosted,
        }),
      }),
    },
  );
};

describe("useUpgradeAction", () => {
  it("should set onClick to open modal when hosted and url is UPGRADE_URL", () => {
    const { result, store } = setup({ isHosted: true, url: UPGRADE_URL });

    expect(store.getState().modal.id).toBeNull();

    expect(result.current.url).toBe(undefined);
    result.current.onClick?.();

    expect(store.getState().modal.id).toBe("upgrade");
  });

  it("should set onClick to open modal when hosted and url is DATA_STUDIO_UPGRADE_URL", () => {
    const { result, store } = setup({
      isHosted: true,
      url: DATA_STUDIO_UPGRADE_URL,
    });

    expect(store.getState().modal.id).toBeNull();

    expect(result.current.url).toBe(undefined);
    result.current.onClick?.();

    expect(store.getState().modal.id).toBe("upgrade");
  });

  it("should set url with params and onClick undefined when is-hosted is false", () => {
    const { result, store } = setup({
      isHosted: false,
      url: UPGRADE_URL,
      campaign: "test-campaign",
      location: "test-location",
    });

    expect(result.current.url).toBe(
      UPGRADE_URL +
        "?utm_source=product&utm_medium=upsell&utm_campaign=test-campaign&utm_content=test-location&source_plan=oss",
    );
    expect(result.current.onClick).toBe(undefined);

    expect(store.getState().modal.id).toBeNull();
  });
});
