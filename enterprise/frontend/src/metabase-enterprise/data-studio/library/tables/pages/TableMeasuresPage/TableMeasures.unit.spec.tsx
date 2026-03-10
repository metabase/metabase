import { Route } from "react-router";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import type { ENTERPRISE_PLUGIN_NAME } from "__support__/enterprise-typed";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import type {
  EnterpriseSettings,
  Table,
  TokenFeatures,
} from "metabase-types/api";
import {
  createMockTable,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { TableMeasures } from "./TableMeasures";

type SetupOpts = {
  isAdmin?: boolean;
  remoteSyncType?: EnterpriseSettings["remote-sync-type"];
  table?: Partial<Table>;
};

const setup = ({ isAdmin = true, remoteSyncType, table }: SetupOpts = {}) => {
  const mockTable = createMockTable({
    id: 1,
    db_id: 1,
    schema: "PUBLIC",
    is_published: true,
    ...table,
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
    currentUser: createMockUser({ is_superuser: isAdmin }),
    settings,
  });

  const enterprisePlugins: ENTERPRISE_PLUGIN_NAME[] = ["remote_sync"];
  enterprisePlugins.forEach(setupEnterpriseOnlyPlugin);

  renderWithProviders(
    <Route path="/" component={() => <TableMeasures table={mockTable} />} />,
    {
      withRouter: true,
      storeInitialState: state,
    },
  );
};

describe("TablesMeasures", () => {
  describe("'new measure' link", () => {
    it("is rendered when user is an admin", () => {
      setup({ isAdmin: true });

      expect(
        screen.getByRole("link", { name: /New measure/i }),
      ).toBeInTheDocument();
    });

    it("is not rendered when user is not an admin", () => {
      setup({ isAdmin: false });

      expect(
        screen.queryByRole("link", { name: /New measure/i }),
      ).not.toBeInTheDocument();
    });

    it("is not rendered when remote sync is set to read-only", () => {
      setup({ remoteSyncType: "read-only" });

      expect(
        screen.queryByRole("link", { name: /New measure/i }),
      ).not.toBeInTheDocument();
    });

    it("is rendered when remote sync is set to read-only but table is not published", () => {
      setup({
        remoteSyncType: "read-only",
        table: { is_published: false },
      });

      expect(
        screen.getByRole("link", { name: /New measure/i }),
      ).toBeInTheDocument();
    });
  });
});
