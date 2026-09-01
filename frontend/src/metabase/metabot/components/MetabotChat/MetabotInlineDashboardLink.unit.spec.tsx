import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionByIdEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import type {
  GeneratedAdhocDashboard,
  GeneratedDashboard,
} from "metabase/api/ai-streaming/schemas";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import * as Urls from "metabase/urls";
import { createMockCollection } from "metabase-types/api/mocks";
import { createMockStructuredDatasetQuery } from "metabase-types/api/mocks/query";

import { MetabotInlineDashboardLink } from "./MetabotInlineDashboardLink";

const PERSONAL_COLLECTION = createMockCollection({
  id: 1,
  name: "My personal collection",
  can_write: true,
  personal_owner_id: 1,
});

const ROOT_TEST_COLLECTION = createMockCollection({
  ...ROOT_COLLECTION,
  id: "root",
  can_write: false,
});

const datasetQuery = createMockStructuredDatasetQuery();

const dashboard: GeneratedAdhocDashboard = {
  type: "dashboard",
  id: "dash-1",
  title: "Ops overview",
  description: "Key ops charts.",
  tiles: [
    {
      title: "Venues by price",
      display: "bar",
      query: datasetQuery,
      chart_id: "c-1",
      row: 0,
      col: 0,
      size_x: 12,
      size_y: 6,
    },
  ],
};

function setupSaveModalEndpoints() {
  setupCollectionByIdEndpoint({ collections: [PERSONAL_COLLECTION] });
  setupCollectionsEndpoints({
    collections: [PERSONAL_COLLECTION],
    rootCollection: ROOT_TEST_COLLECTION,
  });
  setupRecentViewsAndSelectionsEndpoints([], ["selections"]);
  setupRecentViewsAndSelectionsEndpoints(
    [],
    ["selections", "views"],
    {},
    false,
  );
  setupDatabasesEndpoints([]);
}

function setup(
  value: GeneratedDashboard = dashboard,
  { readonly = false }: { readonly?: boolean } = {},
) {
  return renderWithProviders(
    <MetabotInlineDashboardLink
      value={value}
      readonly={readonly}
      conversationId="convo-1"
    />,
  );
}

async function openSaveModal() {
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  return screen.findByTestId("save-dashboard-modal");
}

describe("MetabotInlineDashboardLink", () => {
  beforeEach(() => {
    fetchMock.clearHistory();
  });

  it("links the title to the ad-hoc dashboard built from the tiles", () => {
    setup();

    expect(
      screen.getByRole("link", { name: "Open dashboard" }),
    ).toHaveAttribute("href", Urls.generatedDashboard(dashboard, "convo-1"));
  });

  it("does not offer saving for x-ray dashboards or in readonly mode", () => {
    setup({
      type: "dashboard",
      title: "X-ray",
      url: "/auto/dashboard/table/1",
    });
    expect(
      screen.queryByRole("button", { name: "Save" }),
    ).not.toBeInTheDocument();

    setup(dashboard, { readonly: true });
    expect(
      screen.queryByRole("button", { name: "Save" }),
    ).not.toBeInTheDocument();
  });

  it("opens the save modal prefilled with the dashboard's title and description", async () => {
    setupSaveModalEndpoints();
    setup();

    const modal = await openSaveModal();
    expect(within(modal).getByLabelText("Name")).toHaveValue("Ops overview");
    expect(within(modal).getByLabelText("Description")).toHaveValue(
      "Key ops charts.",
    );
  });

  it("saves the dashboard through the metabot endpoint and shows a Saved link", async () => {
    setupSaveModalEndpoints();
    fetchMock.post(
      "express:/api/metabot/conversations/:id/saved-dashboard",
      {
        id: 9,
        name: "Ops overview",
        description: "Key ops charts.",
        collection_id: 1,
      },
      {
        name: "save-dashboard",
        matchPartialBody: true,
        body: {
          dashboard_id: "dash-1",
          dashboard: {
            name: "Ops overview",
            description: "Key ops charts.",
            tiles: [
              {
                title: "Venues by price",
                display: "bar",
                dataset_query: datasetQuery,
                chart_id: "c-1",
                row: 0,
                col: 0,
                size_x: 12,
                size_y: 6,
              },
            ],
          },
        },
      },
    );
    setup();

    const modal = await openSaveModal();
    const saveButton = within(modal).getByRole("button", { name: "Save" });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(fetchMock.callHistory.called("save-dashboard")).toBe(true);
    });
    expect(await screen.findByRole("link", { name: /Saved/ })).toHaveAttribute(
      "href",
      "/dashboard/9-ops-overview",
    );
    expect(
      screen.getByRole("link", { name: "Open dashboard" }),
    ).toHaveAttribute("href", "/dashboard/9-ops-overview");
  });
});
