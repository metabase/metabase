import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import type { ENTERPRISE_PLUGIN_NAME } from "__support__/enterprise-typed";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type {
  CollectionItem,
  EnterpriseSettings,
  TokenFeatures,
} from "metabase-types/api";
import {
  createMockCollectionItem,
  createMockTable,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { TableMoreMenu, type TableMoreMenuProps } from "./TableMoreMenu";

type SetupOpts = {
  table?: TableMoreMenuProps["table"];
  remoteSyncType?: EnterpriseSettings["remote-sync-type"];
};

const setup = ({ table, remoteSyncType }: SetupOpts = {}) => {
  const tableData =
    table ??
    createMockTable({
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

  const enterprisePlugins: ENTERPRISE_PLUGIN_NAME[] = ["remote_sync"];
  enterprisePlugins.forEach(setupEnterpriseOnlyPlugin);

  renderWithProviders(
    <Route path="/" component={() => <TableMoreMenu table={tableData} />} />,
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

  describe("with CollectionItem", () => {
    it("renders View, Move, and Unpublish menu options", async () => {
      const collectionItem = createMockCollectionItem({
        id: 42,
        model: "table",
        name: "Orders",
        database_id: 1,
        collection_id: 10,
      }) as CollectionItem;

      setup({ table: collectionItem });
      await userEvent.click(
        screen.getByRole("button", { name: "Show table options" }),
      );
      expect(
        screen.getByRole("menuitem", { name: /View/ }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("menuitem", { name: /Move/ }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("menuitem", { name: /Unpublish/ }),
      ).toBeInTheDocument();
    });

    it("renders menu without View when database_id is missing", async () => {
      const collectionItem = createMockCollectionItem({
        id: 42,
        model: "table",
        name: "Orders",
        database_id: undefined,
        collection_id: 10,
      }) as CollectionItem;

      setup({ table: collectionItem });
      await userEvent.click(
        screen.getByRole("button", { name: "Show table options" }),
      );
      expect(
        screen.queryByRole("menuitem", { name: /View/ }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("menuitem", { name: /Move/ }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("menuitem", { name: /Unpublish/ }),
      ).toBeInTheDocument();
    });
  });
});
