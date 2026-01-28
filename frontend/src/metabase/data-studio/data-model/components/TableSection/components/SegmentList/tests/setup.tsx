import { Route } from "react-router";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import type { EnterpriseSettings, Segment, Table } from "metabase-types/api";
import {
  createMockTable,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import type { State } from "metabase-types/store";
import { createMockState } from "metabase-types/store/mocks";

import { SegmentList } from "../SegmentList";

type SetupOpts = {
  segments?: Segment[];
  table?: Partial<Table>;
  isAdmin?: boolean;
  remoteSyncType?: EnterpriseSettings["remote-sync-type"];
  isEnterprise?: boolean;
};

export function setup({
  segments = [],
  table = {},
  isAdmin = true,
  remoteSyncType,
  isEnterprise = false,
}: SetupOpts = {}) {
  const mockTable = createMockTable({
    id: 1,
    db_id: 1,
    schema: "PUBLIC",
    segments,
    is_published: true,
    ...table,
  });

  let state: State;

  if (isEnterprise) {
    const settings = mockSettings({
      "remote-sync-type": remoteSyncType,
      "remote-sync-enabled": !!remoteSyncType,
      "token-features": createMockTokenFeatures({
        data_studio: true,
        remote_sync: true,
      }),
    });
    state = createMockState({
      settings,
      currentUser: createMockUser({ is_superuser: isAdmin }),
    });
    ["library", "remote_sync"].forEach(setupEnterpriseOnlyPlugin);
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
    <Route path="/" component={() => <SegmentList table={mockTable} />} />,
    {
      withRouter: true,
      storeInitialState: state,
    },
  );
}
