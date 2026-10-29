import {
  setupActionsEndpoints,
  setupCollectionsEndpoints,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
} from "__support__/ui";
import { Route } from "metabase/router";
import type { WritebackAction } from "metabase-types/api";
import {
  createMockCollection,
  createMockQueryAction,
  createMockUser,
} from "metabase-types/api/mocks";

import { ArchivedActionListPage } from "./ArchivedActionListPage";

type SetupOpts = {
  actions: WritebackAction[];
};

function setup({ actions }: SetupOpts) {
  setupActionsEndpoints(actions);
  setupCollectionsEndpoints({
    collections: [
      createMockCollection({
        id: "root",
        name: "Root",
        namespace: "data-actions",
      }),
    ],
  });

  renderWithProviders(<Route path="/" element={<ArchivedActionListPage />} />, {
    withRouter: true,
    storeInitialState: createMockState({
      currentUser: createMockUser({ is_superuser: false }),
    }),
  });
}

describe("ArchivedActionListPage", () => {
  beforeEach(() => {
    mockGetBoundingClientRect({ width: 1000, height: 1000 });
  });

  it("offers unarchiving an archived action the user can write", async () => {
    setup({
      actions: [
        createMockQueryAction({
          id: 1,
          name: "Refund order",
          collection_id: null,
          archived: true,
          can_write: true,
        }),
      ],
    });

    expect(await screen.findByText("Refund order")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Unarchive action" }),
    ).toBeInTheDocument();
  });

  it("doesn't offer unarchiving an archived action the user can't write", async () => {
    setup({
      actions: [
        createMockQueryAction({
          id: 1,
          name: "Refund order",
          collection_id: null,
          archived: true,
          can_write: false,
        }),
      ],
    });

    expect(await screen.findByText("Refund order")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Unarchive action" }),
    ).not.toBeInTheDocument();
  });
});
