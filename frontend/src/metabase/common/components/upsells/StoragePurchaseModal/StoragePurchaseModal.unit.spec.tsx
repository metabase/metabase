import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDatabaseListEndpoint,
  setupPropertiesEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { TokenFeatures } from "metabase-types/api";
import {
  createMockDatabase,
  createMockSettings,
  createMockTokenFeatures,
  createMockTokenStatus,
} from "metabase-types/api/mocks";

import { StoragePurchaseModal } from "./StoragePurchaseModal";

interface SetupOpts {
  tokenFeatures?: Partial<TokenFeatures>;
  uploadDbId?: number | null;
}

const setup = ({ tokenFeatures = {}, uploadDbId = null }: SetupOpts = {}) => {
  const onClose = jest.fn();

  const settingValues = {
    "token-features": createMockTokenFeatures(tokenFeatures),
    "uploads-settings": {
      db_id: uploadDbId,
      schema_name: null,
      table_prefix: null,
    },
  };

  setupPropertiesEndpoints(
    createMockSettings({
      ...settingValues,
      "token-status": createMockTokenStatus({
        features: tokenFeatures.attached_dwh ? ["attached-dwh"] : [],
      }),
    }),
  );
  // Storage is only "ready" once the upload database actually surfaces in the
  // databases list and accepts uploads, so seed it when an upload db is expected.
  setupDatabaseListEndpoint(
    uploadDbId != null
      ? [createMockDatabase({ id: uploadDbId, can_upload: true })]
      : [],
  );
  fetchMock.post("path:/api/ee/cloud-add-ons/dwh-rent", 200);
  fetchMock.post(
    "path:/api/premium-features/token/refresh",
    createMockTokenStatus(),
  );

  renderWithProviders(<StoragePurchaseModal opened onClose={onClose} />, {
    storeInitialState: createMockState({
      settings: mockSettings(settingValues),
    }),
  });

  return { onClose };
};

const clickAddStorage = () =>
  userEvent.click(screen.getByRole("button", { name: "Add storage" }));

describe("StoragePurchaseModal", () => {
  it("renders the minimal purchase layout with the disclaimer", () => {
    setup();

    expect(
      screen.getByText(
        "Get a fully managed data warehouse. Upload CSV files and sync with Google Sheets.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /You will not be charged until you reach 1M stored rows/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add storage" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("purchases the add-on and transitions to the setting-up state", async () => {
    setup();

    await clickAddStorage();

    expect(await screen.findByText("Setting up storage")).toBeInTheDocument();

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/ee/cloud-add-ons/dwh-rent", {
          method: "POST",
        }),
      ).toBe(true);
    });
  });

  it("reloads the databases list while setting up", async () => {
    setup();

    await clickAddStorage();

    expect(await screen.findByText("Setting up storage")).toBeInTheDocument();

    // The hook polls the databases list (in addition to settings) so the
    // surrounding UI can react without a page reload.
    await waitFor(
      () => {
        expect(
          fetchMock.callHistory.calls("path:/api/database").length,
        ).toBeGreaterThan(1);
      },
      { timeout: 3000 },
    );
  });

  it("stays in the setting-up state while the upload database is missing", async () => {
    setup({ tokenFeatures: { attached_dwh: true } });

    await clickAddStorage();

    expect(await screen.findByText("Setting up storage")).toBeInTheDocument();
    expect(screen.queryByText("Storage is ready")).not.toBeInTheDocument();
  });

  it("shows the ready state once storage is attached and the upload database is available", async () => {
    setup({
      tokenFeatures: { attached_dwh: true },
      uploadDbId: 1,
    });

    await clickAddStorage();

    expect(await screen.findByText("Storage is ready")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();
  });
});
