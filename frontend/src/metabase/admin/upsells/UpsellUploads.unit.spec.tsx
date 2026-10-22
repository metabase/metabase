import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import type { TokenFeatures } from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { UpsellUploads } from "./UpsellUploads";

type SetupOpts = {
  tokenFeatures?: Partial<TokenFeatures>;
};

const setup = ({ tokenFeatures = {} }: SetupOpts = {}) => {
  renderWithProviders(<UpsellUploads location="settings-uploads" />, {
    storeInitialState: createMockState({
      currentUser: createMockUser({ is_superuser: true }),
      settings: mockSettings({
        "token-features": createMockTokenFeatures(tokenFeatures),
      }),
    }),
  });
};

describe("UpsellUploads", () => {
  it("shows the upsell when upload management is off", () => {
    setup({ tokenFeatures: { upload_management: false } });

    expect(screen.getByText("Manage your uploads")).toBeInTheDocument();
  });

  it("hides the upsell when upload management is on", () => {
    setup({ tokenFeatures: { upload_management: true } });

    expect(screen.queryByText("Manage your uploads")).not.toBeInTheDocument();
  });
});
