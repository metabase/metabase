import userEvent from "@testing-library/user-event";

import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import {
  trackUpsellClicked,
  trackUpsellViewed,
} from "metabase/common/components/upsells/components/analytics";
import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";
import { createMockState } from "metabase/redux/store/mocks";
import { createMockSettings } from "metabase-types/api/mocks";

import { UpsellProBanner } from "./UpsellProBanner";

jest.mock("metabase/common/components/upsells/components/analytics", () => ({
  trackUpsellViewed: jest.fn(),
  trackUpsellClicked: jest.fn(),
}));

const CAMPAIGN = "embedding-hub";
const LOCATION = "embedding-hub-get-started";

interface SetupOpts {
  /** Hosted instances register a flow; self-hosted leaves it undefined. */
  triggerUpsellFlow?: () => void;
}

function setup({ triggerUpsellFlow }: SetupOpts = {}) {
  jest
    .spyOn(PLUGIN_ADMIN_SETTINGS, "useUpsellFlow")
    .mockReturnValue({ triggerUpsellFlow });

  const settings = createMockSettings();

  renderWithProviders(
    <UpsellProBanner title="Upgrade to do more" location={LOCATION} />,
    {
      storeInitialState: createMockState({ settings: mockSettings(settings) }),
    },
  );
}

describe("UpsellProBanner", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("fires upsell_viewed once on mount", () => {
    setup();

    expect(trackUpsellViewed).toHaveBeenCalledTimes(1);
    expect(trackUpsellViewed).toHaveBeenCalledWith({
      location: LOCATION,
      campaign: CAMPAIGN,
    });
    expect(trackUpsellClicked).not.toHaveBeenCalled();
  });

  it("fires upsell_clicked when the CTA is pressed", async () => {
    setup();

    await userEvent.click(
      screen.getByRole("link", { name: "Try Metabase Pro" }),
    );

    expect(trackUpsellClicked).toHaveBeenCalledWith({
      location: LOCATION,
      campaign: CAMPAIGN,
    });
  });

  it("links out to the store when no upsell flow is registered", () => {
    setup();

    const cta = screen.getByRole("link", { name: "Try Metabase Pro" });

    expect(cta).toHaveAttribute(
      "href",
      expect.stringContaining("metabase.com/upgrade"),
    );
    expect(cta).toHaveAttribute(
      "href",
      expect.stringContaining(`utm_campaign=${CAMPAIGN}`),
    );
    expect(cta).toHaveAttribute(
      "href",
      expect.stringContaining(`utm_content=${LOCATION}`),
    );
  });

  it("runs the registered flow instead of navigating", async () => {
    const triggerUpsellFlow = jest.fn();
    setup({ triggerUpsellFlow });

    // Not a link at all when a flow is registered -- the upgrade happens in a
    // modal, so an href would navigate out of it.
    expect(
      screen.queryByRole("link", { name: "Try Metabase Pro" }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Try Metabase Pro" }),
    );

    expect(triggerUpsellFlow).toHaveBeenCalled();
    expect(trackUpsellClicked).toHaveBeenCalledWith({
      location: LOCATION,
      campaign: CAMPAIGN,
    });
  });

  it("shows the title it was given", () => {
    setup();

    expect(screen.getByText("Upgrade to do more")).toBeInTheDocument();
  });
});
