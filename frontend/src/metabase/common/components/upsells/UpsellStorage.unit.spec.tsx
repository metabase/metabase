import userEvent from "@testing-library/user-event";

import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { TokenFeatures } from "metabase-types/api";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { UpsellStorage } from "./UpsellStorage";

interface SetupOpts {
  isHosted?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
  onAddClick?: () => void;
}

const setup = ({
  isHosted = true,
  tokenFeatures = {},
  onAddClick,
}: SetupOpts = {}) => {
  const settingValues = createMockSettings({
    "is-hosted?": isHosted,
    "store-url": "https://store.metabase.com",
    "token-features": createMockTokenFeatures(tokenFeatures),
  });

  const state = createMockState({
    currentUser: createMockUser({ is_superuser: true }),
    settings: mockSettings(settingValues),
  });

  renderWithProviders(
    <UpsellStorage location="add-data-modal-csv" onAddClick={onAddClick} />,
    { storeInitialState: state },
  );
};

describe("UpsellStorage", () => {
  it("renders nothing when the instance is not hosted", () => {
    setup({ isHosted: false });
    expect(screen.queryByText("Add Metabase Storage")).not.toBeInTheDocument();
  });

  it("renders regardless of storage ownership (visibility is caller-controlled)", () => {
    setup({ tokenFeatures: { attached_dwh: true } });
    expect(screen.getByText("Add Metabase Storage")).toBeInTheDocument();
  });

  it("links out to the store on hosted instances without storage", () => {
    setup();

    expect(screen.getByText("Add Metabase Storage")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add" })).toHaveAttribute(
      "href",
      expect.stringContaining("/account/storage"),
    );
  });

  it("renders Add as a button invoking the handler when onAddClick is set", async () => {
    const onAddClick = jest.fn();
    setup({ onAddClick });

    expect(screen.queryByRole("link", { name: "Add" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(onAddClick).toHaveBeenCalledTimes(1);
  });
});
