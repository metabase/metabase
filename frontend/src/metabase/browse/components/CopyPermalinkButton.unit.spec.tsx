import userEvent from "@testing-library/user-event";

import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { createMockSettings } from "metabase-types/api/mocks";

import { CopyPermalinkButton } from "./CopyPermalinkButton";

const SITE_URL = "https://metabase.example.com";

const setup = ({ url }: { url: string }) => {
  const settings = createMockSettings({ "site-url": SITE_URL });
  return renderWithProviders(<CopyPermalinkButton url={url} />, {
    storeInitialState: createMockState({ settings: mockSettings(settings) }),
  });
};

describe("CopyPermalinkButton", () => {
  beforeEach(() => {
    jest.mocked(navigator.clipboard.writeText).mockClear();
  });

  it("copies the site-url-prefixed permalink to the clipboard", async () => {
    setup({ url: "/browse/databases/Sales" });

    await userEvent.click(screen.getByLabelText("Copy permalink"));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      `${SITE_URL}/browse/databases/Sales`,
    );
  });

  it("preserves the encoded segments of the permalink", async () => {
    setup({ url: "/browse/databases/Data%20Warehouse/schema/public" });

    await userEvent.click(screen.getByLabelText("Copy permalink"));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      `${SITE_URL}/browse/databases/Data%20Warehouse/schema/public`,
    );
  });
});
