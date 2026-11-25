import userEvent from "@testing-library/user-event";
import _ from "underscore";

import {
  setupAuditInfoEndpoint,
  setupCustomVizPluginListEndpoint,
  setupLastDownloadFormatEndpoints,
  setupPerformanceEndpoints,
  setupRevisionsEndpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { setupListNotificationEndpoints } from "__support__/server-mocks/notification";
import { screen, waitFor, within } from "__support__/ui";
import { mockGetBoundingClientRect } from "__support__/utils";
import { registerVisualizations } from "metabase/visualizations/register";
import type { TokenFeatures } from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockUserListResult,
} from "metabase-types/api/mocks";

import { TEST_STRUCTURED_CARD, setup } from "./test-utils";

registerVisualizations();

// The e2e test of this flow used a pro self-hosted token, which turns on
// every paid feature. "Edit settings" needs granular caching.
const ALL_TOKEN_FEATURES: TokenFeatures = _.mapObject(
  createMockTokenFeatures(),
  () => true,
);

async function setupNotebook() {
  setupAuditInfoEndpoint();
  setupCustomVizPluginListEndpoint();
  setupPerformanceEndpoints([]);
  setupRevisionsEndpoints([]);
  setupUsersEndpoints([createMockUserListResult()]);
  setupListNotificationEndpoints({ card_id: TEST_STRUCTURED_CARD.id }, []);

  return setup({
    card: TEST_STRUCTURED_CARD,
    initialRoute: `/question/${TEST_STRUCTURED_CARD.id}/notebook`,
    tokenFeatures: ALL_TOKEN_FEATURES,
    hasEnterprisePlugins: true,
  });
}

/**
 * The notebook stays in the DOM while it animates away, and jsdom never ends
 * the animation, so check the mode toggle in the header as well.
 */
function expectNotebookToBeOpen() {
  expect(screen.getByRole("button", { name: "Visualize" })).toBeVisible();
  expect(screen.getByTestId("notebook-button")).toHaveTextContent(
    "Visualization",
  );
}

describe("QueryBuilder > notebook > sidesheets (UXW-224)", () => {
  mockGetBoundingClientRect();

  beforeEach(() => {
    setupLastDownloadFormatEndpoints();
  });

  it("keeps the notebook editor mounted when the question info and settings sidesheets open", async () => {
    const { router } = await setupNotebook();

    expect(router.location.pathname).toContain("/notebook");
    expect(
      await screen.findByRole("button", { name: "Visualize" }),
    ).toBeInTheDocument();
    expectNotebookToBeOpen();

    await userEvent.click(screen.getByTestId("qb-header-info-button"));
    const infoSidesheet = await screen.findByTestId("sidesheet");
    expect(infoSidesheet).toBeInTheDocument();
    expectNotebookToBeOpen();

    await userEvent.click(within(infoSidesheet).getByLabelText("Close"));
    await waitFor(() =>
      expect(screen.queryByTestId("sidesheet")).not.toBeInTheDocument(),
    );
    expect(router.location.pathname).toContain("/notebook");
    expectNotebookToBeOpen();

    await userEvent.click(
      within(screen.getByTestId("qb-header-action-panel")).getByRole("img", {
        name: "ellipsis icon",
      }),
    );
    await userEvent.click(await screen.findByText("Edit settings"));
    expect(await screen.findByTestId("sidesheet")).toBeInTheDocument();
    expect(router.location.pathname).toContain("/notebook");
    expectNotebookToBeOpen();
  });
});
