import { Route } from "react-router";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import type { ENTERPRISE_PLUGIN_NAME } from "__support__/enterprise-typed";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import type { EnterpriseSettings, Measure, Table } from "metabase-types/api";
import {
  createMockTable,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import type { State } from "metabase-types/store";
import { createMockState } from "metabase-types/store/mocks";

import { MeasureList } from "../MeasureList";

type SetupOpts = {
  measures?: Measure[];
  table?: Partial<Table>;
  isAdmin?: boolean;
  remoteSyncType?: EnterpriseSettings["remote-sync-type"];
  isEnterprise?: boolean;
};

export function setup({
  measures = [],
  table = {},
  isAdmin = true,
  remoteSyncType,
  isEnterprise = false,
}: SetupOpts = {}) {
  const mockTable = createMockTable({
    id: 1,
    db_id: 1,
    schema: "PUBLIC",
    measures,
    is_published: true,
    ...table,
  });

  let state: State;

  if (isEnterprise) {
    const settings = mockSettings({
      "remote-sync-type": remoteSyncType,
      "remote-sync-enabled": !!remoteSyncType,
      "token-features": createMockTokenFeatures({
        library: true,
        remote_sync: true,
      }),
    });
    state = createMockState({
      settings,
      currentUser: createMockUser({ is_superuser: isAdmin }),
    });
    const pluginNames: ENTERPRISE_PLUGIN_NAME[] = ["library", "remote_sync"];
    pluginNames.forEach(setupEnterpriseOnlyPlugin);
  } else {
    state = createMockState({
      settings: mockSettings({
        "remote-sync-type": remoteSyncType,
        "remote-sync-enabled": !!remoteSyncType,
      }),
      currentUser: createMockUser({ is_superuser: isAdmin }),
    });
  }

  renderWithProviders(
    <Route path="/" component={() => <MeasureList table={mockTable} />} />,
    {
      withRouter: true,
      storeInitialState: state,
    },
  );
}
