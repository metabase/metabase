import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import type { EnterpriseSettings, TokenFeatures } from "metabase-types/api";
import {
  createMockTable,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { TableMoreMenu } from "./TableMoreMenu";

type SetupOpts = {
  remoteSyncType?: EnterpriseSettings["remote-sync-type"];
};

const setup = ({ remoteSyncType }: SetupOpts = {}) => {
  const mockTable = createMockTable({
    id: 1,
    db_id: 1,
    schema: "PUBLIC",
  });

  const tokenFeatures: Partial<TokenFeatures> = {
    remote_sync: !!remoteSyncType,
  };
  const settings = mockSettings({
    "remote-sync-type": remoteSyncType,
    "remote-sync-enabled": !!remoteSyncType,
    "token-features": createMockTokenFeatures(tokenFeatures),
  });
  const state = createMockState({
    settings,
  });

  ["remote_sync"].forEach(setupEnterpriseOnlyPlugin);

  renderWithProviders(
    <Route path="/" component={() => <TableMoreMenu table={mockTable} />} />,
    {
      withRouter: true,
      storeInitialState: state,
    },
  );
};

describe("TableMoreMenu", () => {
  it("renders the View and the Unpublish menu options", async () => {
    setup();
    await userEvent.click(
      screen.getByRole("button", { name: "Show table options" }),
    );
    expect(screen.getByRole("menuitem", { name: /View/ })).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /Unpublish/ }),
    ).toBeInTheDocument();
  });

  it("does not render the Unpublish option when remote sync is set to read-only", async () => {
    setup({ remoteSyncType: "read-only" });
    await userEvent.click(
      screen.getByRole("button", { name: "Show table options" }),
    );
    expect(screen.getByRole("menuitem", { name: /View/ })).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /Unpublish/ }),
    ).not.toBeInTheDocument();
  });
});
