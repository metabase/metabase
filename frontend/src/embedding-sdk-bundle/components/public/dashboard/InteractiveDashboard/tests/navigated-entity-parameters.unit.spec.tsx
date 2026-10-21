import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { type ReactElement, useState } from "react";
import _ from "underscore";

import {
  setupAdhocQueryMetadataEndpoint,
  setupBookmarksEndpoints,
  setupCardDataset,
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupCardQueryMetadataEndpoint,
  setupCollectionByIdEndpoint,
  setupCollectionsEndpoints,
  setupDashboardEndpoints,
  setupDashboardQueryMetadataEndpoint,
  setupDatabasesEndpoints,
  setupLastDownloadFormatEndpoints,
} from "__support__/server-mocks";
import { setupDashcardQueryEndpoints } from "__support__/server-mocks/dashcard";
import { setupNotificationChannelsEndpoints } from "__support__/server-mocks/pulse";
import { mockGetBoundingClientRect, screen, waitFor } from "__support__/ui";
import { renderWithSDKProviders } from "embedding-sdk-bundle/test/__support__/ui";
import { createMockSdkConfig } from "embedding-sdk-bundle/test/mocks/config";
import { setupSdkState } from "embedding-sdk-bundle/test/server-mocks/sdk-init";
import type { ParameterChangePayload } from "embedding-sdk-bundle/types/dashboard";
import type {
  NavigatedEntityParameterChangePayload,
  NavigatedEntityParameters,
  NavigationId,
} from "embedding-sdk-bundle/types/navigation";
import { loadVisualizationComponents } from "metabase/viz-core";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import type { Card, ClickBehavior, Dashboard } from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockCollection,
  createMockColumn,
  createMockDashboard,
  createMockDashboardCard,
  createMockDashboardQueryMetadata,
  createMockDataset,
  createMockDatasetData,
  createMockNativeDatasetQuery,
  createMockParameter,
  createMockStructuredDatasetQuery,
  createMockTextDashboardCard,
} from "metabase-types/api/mocks";
import { createMockEntityId } from "metabase-types/api/mocks/entity-id";
import {
  PRODUCTS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { InteractiveDashboard } from "../InteractiveDashboard";

// Tests that control the target write their host `App` inline on purpose, so
// they also show the code a customer would write.

beforeAll(() => {
  mockGetBoundingClientRect();
  return loadVisualizationComponents(["table"]);
});

const DATABASE = createSampleDatabase();

const ROOT_DASHBOARD_ID = 1;
const TARGET_DASHBOARD_ID = 2;
const OTHER_DASHBOARD_ID = 3;
const SQL_QUESTION_ID = 30;
const GUI_QUESTION_ID = 40;

const CATEGORY_COLUMN = createMockColumn({
  name: "CATEGORY",
  display_name: "Category",
  base_type: "type/Text",
});

// Table dashcards only use column click behaviors
const createCategoryClickBehaviorSettings = (clickBehavior: ClickBehavior) => ({
  column_settings: {
    [getColumnKey(CATEGORY_COLUMN)]: { click_behavior: clickBehavior },
  },
});

const createCategoryDataset = (categories: string[]) =>
  createMockDataset({
    data: createMockDatasetData({
      cols: [CATEGORY_COLUMN],
      rows: categories.map((category) => [category]),
    }),
  });

const createNativeCard = (
  card: Partial<Card> & Pick<Card, "id" | "name">,
  templateTags: string[] = [],
) =>
  createMockCard({
    display: "table",
    dataset_query: createMockNativeDatasetQuery({
      database: DATABASE.id,
      native: {
        query: "select category from products",
        "template-tags": Object.fromEntries(
          templateTags.map((tag) => [
            tag,
            { id: `tag-${tag}`, name: tag, "display-name": tag, type: "text" },
          ]),
        ),
      },
    }),
    ...card,
  });

const CATEGORY_PARAMETER = createMockParameter({
  id: "p-category",
  slug: "category",
  name: "Category",
  type: "string/=",
});

const VENDOR_PARAMETER = createMockParameter({
  id: "p-vendor",
  slug: "vendor",
  name: "Vendor",
  type: "string/=",
  default: ["Acme"],
  isMultiSelect: false,
});

const CATEGORY_SOURCE = {
  type: "column",
  id: "CATEGORY",
  name: "Category",
} as const;

const linkToTargetDashboard = ({
  mapsCategory,
}: {
  mapsCategory: boolean;
}): ClickBehavior => ({
  type: "link",
  linkType: "dashboard",
  targetId: TARGET_DASHBOARD_ID,
  parameterMapping: mapsCategory
    ? {
        [CATEGORY_PARAMETER.id]: {
          id: CATEGORY_PARAMETER.id,
          source: CATEGORY_SOURCE,
          target: { type: "parameter", id: CATEGORY_PARAMETER.id },
        },
      }
    : {},
});

const LINK_TO_TARGET_DASHBOARD_VENDOR: ClickBehavior = {
  type: "link",
  linkType: "dashboard",
  targetId: TARGET_DASHBOARD_ID,
  parameterMapping: {
    [VENDOR_PARAMETER.id]: {
      id: VENDOR_PARAMETER.id,
      source: CATEGORY_SOURCE,
      target: { type: "parameter", id: VENDOR_PARAMETER.id },
    },
  },
};

const LINK_TO_SQL_QUESTION: ClickBehavior = {
  type: "link",
  linkType: "question",
  targetId: SQL_QUESTION_ID,
  parameterMapping: {
    category: {
      id: "category",
      source: CATEGORY_SOURCE,
      target: { type: "variable", id: "category" },
    },
  },
};

const LINK_TO_GUI_QUESTION: ClickBehavior = {
  type: "link",
  linkType: "question",
  targetId: GUI_QUESTION_ID,
  parameterMapping: {},
};

const ROOT_CARD = createNativeCard({ id: 10, name: "Root card" });

const TARGET_CARD = createNativeCard({ id: 20, name: "Target card" }, [
  "category",
  "vendor",
]);

const TARGET_DASHCARD = createMockDashboardCard({
  id: 20,
  dashboard_id: TARGET_DASHBOARD_ID,
  card_id: TARGET_CARD.id,
  card: TARGET_CARD,
  parameter_mappings: [
    {
      card_id: TARGET_CARD.id,
      parameter_id: CATEGORY_PARAMETER.id,
      target: ["variable", ["template-tag", "category"]],
    },
    {
      card_id: TARGET_CARD.id,
      parameter_id: VENDOR_PARAMETER.id,
      target: ["variable", ["template-tag", "vendor"]],
    },
  ],
  visualization_settings: createCategoryClickBehaviorSettings({
    type: "link",
    linkType: "dashboard",
    targetId: OTHER_DASHBOARD_ID,
    parameterMapping: {},
  }),
});

const OTHER_DASHBOARD = createMockDashboard({
  id: OTHER_DASHBOARD_ID,
  name: "Other",
  dashcards: [createMockTextDashboardCard({ id: 30, text: "Other text" })],
});

const SQL_QUESTION = createNativeCard(
  {
    id: SQL_QUESTION_ID,
    name: "SQL question",
    entity_id: createMockEntityId("sql-question-entity-id"),
  },
  ["category"],
);

const GUI_QUESTION = createMockCard({
  id: GUI_QUESTION_ID,
  name: "GUI question",
  dataset_query: createMockStructuredDatasetQuery({
    database: DATABASE.id,
    query: { "source-table": PRODUCTS_ID },
  }),
});

const TARGET_QUERY_PATH = `path:/api/dashboard/${TARGET_DASHBOARD_ID}/dashcard/${TARGET_DASHCARD.id}/card/${TARGET_CARD.id}/query`;
const SQL_QUESTION_QUERY_PATH = `path:/api/card/${SQL_QUESTION_ID}/query`;

const setupEndpoints = ({
  clickBehavior,
  targetLastUsedParameterValues = {},
}: {
  clickBehavior: ClickBehavior;
  targetLastUsedParameterValues?: Dashboard["last_used_param_values"];
}) => {
  const rootDashcard = createMockDashboardCard({
    id: 10,
    dashboard_id: ROOT_DASHBOARD_ID,
    card_id: ROOT_CARD.id,
    card: ROOT_CARD,
    visualization_settings: createCategoryClickBehaviorSettings(clickBehavior),
  });
  const rootDashboard = createMockDashboard({
    id: ROOT_DASHBOARD_ID,
    name: "Root",
    dashcards: [rootDashcard],
  });
  const targetDashboard = createMockDashboard({
    id: TARGET_DASHBOARD_ID,
    entity_id: createMockEntityId("target-dashboard-entity-id"),
    name: "Target",
    parameters: [CATEGORY_PARAMETER, VENDOR_PARAMETER],
    dashcards: [TARGET_DASHCARD],
    last_used_param_values: targetLastUsedParameterValues,
  });
  const cardQueryMetadata = createMockCardQueryMetadata({
    databases: [DATABASE],
  });

  setupDashboardEndpoints(rootDashboard);
  setupDashboardQueryMetadataEndpoint(
    rootDashboard,
    createMockDashboardQueryMetadata({
      databases: [DATABASE],
      dashboards: [targetDashboard],
      cards: [SQL_QUESTION, GUI_QUESTION],
    }),
  );
  setupDashcardQueryEndpoints(
    ROOT_DASHBOARD_ID,
    rootDashcard,
    createCategoryDataset(["Gizmo"]),
  );

  setupDashboardEndpoints(targetDashboard);
  setupDashboardQueryMetadataEndpoint(
    targetDashboard,
    createMockDashboardQueryMetadata({
      databases: [DATABASE],
      dashboards: [OTHER_DASHBOARD],
    }),
  );
  setupDashcardQueryEndpoints(
    TARGET_DASHBOARD_ID,
    TARGET_DASHCARD,
    createCategoryDataset(["Widget"]),
  );

  setupDashboardEndpoints(OTHER_DASHBOARD);
  setupDashboardQueryMetadataEndpoint(
    OTHER_DASHBOARD,
    createMockDashboardQueryMetadata({ databases: [DATABASE] }),
  );

  setupCardEndpoints(SQL_QUESTION);
  setupCardQueryMetadataEndpoint(SQL_QUESTION, cardQueryMetadata);
  setupCardQueryEndpoints(SQL_QUESTION, createCategoryDataset(["Gizmo"]));

  setupCardEndpoints(GUI_QUESTION);
  setupCardQueryMetadataEndpoint(GUI_QUESTION, cardQueryMetadata);
  setupCardQueryEndpoints(GUI_QUESTION, createCategoryDataset(["Gizmo"]));
  setupAdhocQueryMetadataEndpoint(cardQueryMetadata);
  setupCardDataset({
    dataset: { data: { cols: [CATEGORY_COLUMN], rows: [["Gizmo"]] } },
  });

  setupCollectionsEndpoints({ collections: [] });
  setupCollectionByIdEndpoint({
    collections: [createMockCollection({ id: 1 })],
  });
  setupDatabasesEndpoints([DATABASE]);
  setupLastDownloadFormatEndpoints();
  setupBookmarksEndpoints([]);
  setupNotificationChannelsEndpoints({});
};

const renderWithSdk = async (app: ReactElement) => {
  const { state } = setupSdkState();

  renderWithSDKProviders(app, {
    componentProviderProps: { authConfig: createMockSdkConfig() },
    storeInitialState: state,
  });

  expect(await screen.findByRole("gridcell", { name: "Gizmo" })).toBeVisible();
};

type QueryRequestParameter = { id: string; target: unknown; value: unknown };

const getQueryRequestParameters = (path: string): QueryRequestParameter[][] =>
  fetchMock.callHistory
    .calls(path)
    .map((call) => JSON.parse(String(call.options.body)).parameters);

const getTargetQueryValues = () =>
  getQueryRequestParameters(TARGET_QUERY_PATH).map((parameters) =>
    Object.fromEntries(
      parameters.map((parameter) => [parameter.id, parameter.value]),
    ),
  );

const getLastTargetQueryValues = () => getTargetQueryValues().at(-1);

const waitForTargetQueries = (count: number) =>
  waitFor(() => expect(getTargetQueryValues()).toHaveLength(count));

const getSqlQuestionCategoryValues = () =>
  getQueryRequestParameters(SQL_QUESTION_QUERY_PATH).map(
    (parameters) =>
      parameters.find((parameter) =>
        _.isEqual(parameter.target, ["variable", ["template-tag", "category"]]),
      )?.value,
  );

const clickCell = async (value: string) =>
  userEvent.click(await screen.findByRole("gridcell", { name: value }));

const openTargetDashboard = async () => {
  await clickCell("Gizmo");
  await waitForTargetQueries(1);
};

const typeInVendorFilter = async (value: string) => {
  const input = await screen.findByPlaceholderText("Vendor");
  await userEvent.clear(input);
  await userEvent.type(input, `${value}{enter}`);
};

const clickAppButton = async (name: string) =>
  userEvent.click(screen.getByRole("button", { name }));

describe("InteractiveDashboard navigated entity parameters", () => {
  describe("the host app can observe the target", () => {
    it("gets initial-state with the entity, the navigation id and the click values", async () => {
      setupEndpoints({
        clickBehavior: linkToTargetDashboard({ mapsCategory: true }),
      });
      const onNavigatedEntityParametersChange = jest.fn<
        void,
        [NavigatedEntityParameterChangePayload]
      >();

      await renderWithSdk(
        <InteractiveDashboard
          dashboardId={ROOT_DASHBOARD_ID}
          enableEntityNavigation
          onNavigatedEntityParametersChange={onNavigatedEntityParametersChange}
        />,
      );
      await openTargetDashboard();

      await waitFor(() =>
        expect(onNavigatedEntityParametersChange).toHaveBeenCalledTimes(1),
      );
      expect(onNavigatedEntityParametersChange).toHaveBeenCalledWith({
        source: "initial-state",
        entityType: "dashboard",
        entityId: "target-dashboard-entity-id",
        navigationId: expect.any(String),
        parameters: { category: ["Gizmo"], vendor: ["Acme"] },
        defaultParameters: { category: null, vendor: ["Acme"] },
        lastUsedParameters: { category: null, vendor: null },
        clickParameters: { category: ["Gizmo"] },
      });
    });

    it("gets manual-change when the user edits a filter, with the same navigation id", async () => {
      setupEndpoints({
        clickBehavior: linkToTargetDashboard({ mapsCategory: true }),
      });
      const onNavigatedEntityParametersChange = jest.fn<
        void,
        [NavigatedEntityParameterChangePayload]
      >();

      await renderWithSdk(
        <InteractiveDashboard
          dashboardId={ROOT_DASHBOARD_ID}
          enableEntityNavigation
          onNavigatedEntityParametersChange={onNavigatedEntityParametersChange}
        />,
      );
      await openTargetDashboard();
      await waitFor(() =>
        expect(onNavigatedEntityParametersChange).toHaveBeenCalledTimes(1),
      );
      const [[initialState]] = onNavigatedEntityParametersChange.mock.calls;

      await typeInVendorFilter("Globex");

      await waitFor(() =>
        expect(onNavigatedEntityParametersChange).toHaveBeenCalledWith({
          ...initialState,
          source: "manual-change",
          parameters: { category: ["Gizmo"], vendor: "Globex" },
        }),
      );
    });

    it("gets the click values also when it adds the callback after the first load", async () => {
      setupEndpoints({ clickBehavior: LINK_TO_TARGET_DASHBOARD_VENDOR });
      const onNavigatedEntityParametersChange = jest.fn<
        void,
        [NavigatedEntityParameterChangePayload]
      >();
      const App = () => {
        const [isListening, setIsListening] = useState(false);

        return (
          <>
            <button onClick={() => setIsListening(true)}>Listen</button>
            <InteractiveDashboard
              dashboardId={ROOT_DASHBOARD_ID}
              enableEntityNavigation
              onNavigatedEntityParametersChange={
                isListening ? onNavigatedEntityParametersChange : undefined
              }
            />
          </>
        );
      };

      await renderWithSdk(<App />);
      await openTargetDashboard();
      await clickAppButton("Listen");
      await typeInVendorFilter("Globex");

      await waitFor(() =>
        expect(onNavigatedEntityParametersChange).toHaveBeenCalledWith(
          expect.objectContaining({
            source: "manual-change",
            clickParameters: { vendor: ["Gizmo"] },
          }),
        ),
      );
    });

    it('gets initial-state when the click opens a SQL question, with entityType "question"', async () => {
      setupEndpoints({ clickBehavior: LINK_TO_SQL_QUESTION });
      const onNavigatedEntityParametersChange = jest.fn<
        void,
        [NavigatedEntityParameterChangePayload]
      >();

      await renderWithSdk(
        <InteractiveDashboard
          dashboardId={ROOT_DASHBOARD_ID}
          enableEntityNavigation
          onNavigatedEntityParametersChange={onNavigatedEntityParametersChange}
        />,
      );
      await clickCell("Gizmo");

      await waitFor(() =>
        expect(onNavigatedEntityParametersChange).toHaveBeenCalledTimes(1),
      );
      expect(onNavigatedEntityParametersChange).toHaveBeenCalledWith({
        source: "initial-state",
        entityType: "question",
        entityId: "sql-question-entity-id",
        navigationId: expect.any(String),
        parameters: { category: ["Gizmo"] },
        defaultParameters: { category: null },
        clickParameters: { category: ["Gizmo"] },
      });
      expect(getSqlQuestionCategoryValues().at(-1)).toEqual(["Gizmo"]);
    });

    it("gets nothing for questions built with the query builder", async () => {
      setupEndpoints({ clickBehavior: LINK_TO_GUI_QUESTION });
      const onNavigatedEntityParametersChange = jest.fn<
        void,
        [NavigatedEntityParameterChangePayload]
      >();

      await renderWithSdk(
        <InteractiveDashboard
          dashboardId={ROOT_DASHBOARD_ID}
          enableEntityNavigation
          onNavigatedEntityParametersChange={onNavigatedEntityParametersChange}
        />,
      );
      await clickCell("Gizmo");

      expect(
        await screen.findByTestId("query-visualization-root"),
      ).toBeInTheDocument();
      expect(onNavigatedEntityParametersChange).not.toHaveBeenCalled();
    });

    it("does not get target changes through the root onParametersChange", async () => {
      setupEndpoints({
        clickBehavior: linkToTargetDashboard({ mapsCategory: true }),
      });
      const onParametersChange = jest.fn<void, [ParameterChangePayload]>();
      const onNavigatedEntityParametersChange = jest.fn<
        void,
        [NavigatedEntityParameterChangePayload]
      >();

      await renderWithSdk(
        <InteractiveDashboard
          dashboardId={ROOT_DASHBOARD_ID}
          enableEntityNavigation
          onParametersChange={onParametersChange}
          onNavigatedEntityParametersChange={onNavigatedEntityParametersChange}
        />,
      );
      const rootEventCount = onParametersChange.mock.calls.length;
      await openTargetDashboard();
      await waitFor(() =>
        expect(onNavigatedEntityParametersChange).toHaveBeenCalledTimes(1),
      );

      expect(onParametersChange).toHaveBeenCalledTimes(rootEventCount);
    });
  });

  describe("the host app can control the target", () => {
    it("keeps the target's values, by setting each payload's parameters as the entry, without another query", async () => {
      setupEndpoints({
        clickBehavior: linkToTargetDashboard({ mapsCategory: true }),
      });
      const onNavigatedEntityParametersChange = jest.fn<
        void,
        [NavigatedEntityParameterChangePayload]
      >();

      const App = () => {
        const [navigatedEntityParameters, setNavigatedEntityParameters] =
          useState<NavigatedEntityParameters>({});

        return (
          <InteractiveDashboard
            dashboardId={ROOT_DASHBOARD_ID}
            enableEntityNavigation
            navigatedEntityParameters={navigatedEntityParameters}
            onNavigatedEntityParametersChange={(payload) => {
              onNavigatedEntityParametersChange(payload);
              setNavigatedEntityParameters((prev) => ({
                ...prev,
                [payload.navigationId]: payload.parameters,
              }));
            }}
          />
        );
      };

      await renderWithSdk(<App />);
      await openTargetDashboard();

      await waitFor(() =>
        expect(onNavigatedEntityParametersChange).toHaveBeenCalledTimes(1),
      );
      expect(getTargetQueryValues()).toEqual([
        { [CATEGORY_PARAMETER.id]: ["Gizmo"], [VENDOR_PARAMETER.id]: ["Acme"] },
      ]);
    });

    it("applies the click values and the defaults of the other filters, by setting clickParameters as the entry for the visit", async () => {
      setupEndpoints({
        clickBehavior: linkToTargetDashboard({ mapsCategory: true }),
      });
      const onNavigatedEntityParametersChange = jest.fn<
        void,
        [NavigatedEntityParameterChangePayload]
      >();

      const App = () => {
        const [navigatedEntityParameters, setNavigatedEntityParameters] =
          useState<NavigatedEntityParameters>({});

        return (
          <InteractiveDashboard
            dashboardId={ROOT_DASHBOARD_ID}
            enableEntityNavigation
            navigatedEntityParameters={navigatedEntityParameters}
            onNavigatedEntityParametersChange={(payload) => {
              onNavigatedEntityParametersChange(payload);
              if (payload.source === "initial-state") {
                setNavigatedEntityParameters((prev) => {
                  // If the map already has this navigationId, this is a back navigation
                  // and we don't want to change the parameters
                  if (prev[payload.navigationId]) {
                    return prev;
                  }
                  return {
                    ...prev,
                    [payload.navigationId]: payload.clickParameters,
                  };
                });
              }
            }}
          />
        );
      };

      await renderWithSdk(<App />);
      await openTargetDashboard();

      await waitFor(() =>
        expect(onNavigatedEntityParametersChange).toHaveBeenCalled(),
      );
      expect(getTargetQueryValues()).toEqual([
        { [CATEGORY_PARAMETER.id]: ["Gizmo"], [VENDOR_PARAMETER.id]: ["Acme"] },
      ]);
    });

    it("applies its own values plus the click values", async () => {
      setupEndpoints({
        clickBehavior: linkToTargetDashboard({ mapsCategory: true }),
      });

      const App = () => {
        const [navigatedEntityParameters, setNavigatedEntityParameters] =
          useState<NavigatedEntityParameters>({});

        return (
          <InteractiveDashboard
            dashboardId={ROOT_DASHBOARD_ID}
            enableEntityNavigation
            navigatedEntityParameters={navigatedEntityParameters}
            onNavigatedEntityParametersChange={(payload) => {
              const { navigationId } = payload;

              switch (payload.source) {
                case "initial-state":
                  setNavigatedEntityParameters((prev) => {
                    // If the map already has this navigationId, this is a back navigation
                    // and we don't want to change the parameters
                    if (prev[navigationId]) {
                      return prev;
                    }
                    return {
                      ...prev,
                      [navigationId]: {
                        ...payload.defaultParameters,
                        vendor: ["Globex"],
                        ...payload.clickParameters,
                      },
                    };
                  });
                  break;
                case "manual-change":
                case "auto-change":
                  setNavigatedEntityParameters((prev) => ({
                    ...prev,
                    [navigationId]: payload.parameters,
                  }));
                  break;
              }
            }}
          />
        );
      };

      await renderWithSdk(<App />);
      await clickCell("Gizmo");

      await waitForTargetQueries(2);
      expect(getLastTargetQueryValues()).toEqual({
        [CATEGORY_PARAMETER.id]: ["Gizmo"],
        [VENDOR_PARAMETER.id]: ["Globex"],
      });
    });

    it("replaces the click values with its own values", async () => {
      setupEndpoints({
        clickBehavior: linkToTargetDashboard({ mapsCategory: true }),
      });

      const App = () => {
        const [navigatedEntityParameters, setNavigatedEntityParameters] =
          useState<NavigatedEntityParameters>({});
        const [navigationId, setNavigationId] = useState<NavigationId | null>(
          null,
        );

        return (
          <>
            <button
              onClick={() =>
                navigationId &&
                setNavigatedEntityParameters((prev) => ({
                  ...prev,
                  [navigationId]: { vendor: ["Globex"] },
                }))
              }
            >
              Only Globex
            </button>
            <InteractiveDashboard
              dashboardId={ROOT_DASHBOARD_ID}
              enableEntityNavigation
              navigatedEntityParameters={navigatedEntityParameters}
              onNavigatedEntityParametersChange={(payload) =>
                setNavigationId(payload.navigationId)
              }
            />
          </>
        );
      };

      await renderWithSdk(<App />);
      await openTargetDashboard();
      await clickAppButton("Only Globex");

      await waitForTargetQueries(2);
      expect(getLastTargetQueryValues()).toEqual({
        [CATEGORY_PARAMETER.id]: null,
        [VENDOR_PARAMETER.id]: ["Globex"],
      });
    });

    it("applies the defaults, by setting defaultParameters as the entry for the visit", async () => {
      setupEndpoints({
        clickBehavior: linkToTargetDashboard({ mapsCategory: true }),
      });

      const App = () => {
        const [navigatedEntityParameters, setNavigatedEntityParameters] =
          useState<NavigatedEntityParameters>({});
        const [lastPayload, setLastPayload] =
          useState<NavigatedEntityParameterChangePayload | null>(null);

        return (
          <>
            <button
              onClick={() =>
                lastPayload &&
                setNavigatedEntityParameters((prev) => ({
                  ...prev,
                  [lastPayload.navigationId]: lastPayload.defaultParameters,
                }))
              }
            >
              Reset filters
            </button>
            <InteractiveDashboard
              dashboardId={ROOT_DASHBOARD_ID}
              enableEntityNavigation
              navigatedEntityParameters={navigatedEntityParameters}
              onNavigatedEntityParametersChange={setLastPayload}
            />
          </>
        );
      };

      await renderWithSdk(<App />);
      await openTargetDashboard();
      await clickAppButton("Reset filters");

      await waitForTargetQueries(2);
      expect(getLastTargetQueryValues()).toEqual({
        [CATEGORY_PARAMETER.id]: null,
        [VENDOR_PARAMETER.id]: ["Acme"],
      });
    });

    it("applies the user's last used values, by setting lastUsedParameters as the entry for the visit", async () => {
      setupEndpoints({
        clickBehavior: linkToTargetDashboard({ mapsCategory: true }),
        targetLastUsedParameterValues: { [VENDOR_PARAMETER.id]: ["Globex"] },
      });

      const App = () => {
        const [navigatedEntityParameters, setNavigatedEntityParameters] =
          useState<NavigatedEntityParameters>({});

        return (
          <InteractiveDashboard
            dashboardId={ROOT_DASHBOARD_ID}
            enableEntityNavigation
            navigatedEntityParameters={navigatedEntityParameters}
            onNavigatedEntityParametersChange={(payload) => {
              if (
                payload.entityType === "dashboard" &&
                payload.source === "initial-state"
              ) {
                setNavigatedEntityParameters((prev) => {
                  // If the map already has this navigationId, this is a back navigation
                  // and we don't want to change the parameters
                  if (prev[payload.navigationId]) {
                    return prev;
                  }
                  return {
                    ...prev,
                    [payload.navigationId]: payload.lastUsedParameters,
                  };
                });
              }
            }}
          />
        );
      };

      await renderWithSdk(<App />);
      await clickCell("Gizmo");

      await waitForTargetQueries(2);
      expect(getLastTargetQueryValues()).toEqual({
        [CATEGORY_PARAMETER.id]: null,
        [VENDOR_PARAMETER.id]: ["Globex"],
      });
    });

    it("follows later changes", async () => {
      setupEndpoints({
        clickBehavior: linkToTargetDashboard({ mapsCategory: true }),
      });

      const App = () => {
        const [navigatedEntityParameters, setNavigatedEntityParameters] =
          useState<NavigatedEntityParameters>({});
        const [navigationId, setNavigationId] = useState<NavigationId | null>(
          null,
        );

        const setVendor = (vendor: string) =>
          navigationId &&
          setNavigatedEntityParameters((prev) => ({
            ...prev,
            [navigationId]: { vendor: [vendor] },
          }));

        return (
          <>
            <button onClick={() => setVendor("Globex")}>Only Globex</button>
            <button onClick={() => setVendor("Initech")}>Only Initech</button>
            <InteractiveDashboard
              dashboardId={ROOT_DASHBOARD_ID}
              enableEntityNavigation
              navigatedEntityParameters={navigatedEntityParameters}
              onNavigatedEntityParametersChange={(payload) =>
                setNavigationId(payload.navigationId)
              }
            />
          </>
        );
      };

      await renderWithSdk(<App />);
      await openTargetDashboard();
      await clickAppButton("Only Globex");
      await waitForTargetQueries(2);
      await clickAppButton("Only Initech");
      await waitForTargetQueries(3);

      expect(getLastTargetQueryValues()).toMatchObject({
        [VENDOR_PARAMETER.id]: ["Initech"],
      });
    });

    it("controls a SQL question target", async () => {
      setupEndpoints({ clickBehavior: LINK_TO_SQL_QUESTION });

      const App = () => {
        const [navigatedEntityParameters, setNavigatedEntityParameters] =
          useState<NavigatedEntityParameters>({});
        const [navigationId, setNavigationId] = useState<NavigationId | null>(
          null,
        );

        return (
          <>
            <button
              onClick={() =>
                navigationId &&
                setNavigatedEntityParameters((prev) => ({
                  ...prev,
                  [navigationId]: { category: ["Widget"] },
                }))
              }
            >
              Only Widget
            </button>
            <InteractiveDashboard
              dashboardId={ROOT_DASHBOARD_ID}
              enableEntityNavigation
              navigatedEntityParameters={navigatedEntityParameters}
              onNavigatedEntityParametersChange={(payload) =>
                setNavigationId(payload.navigationId)
              }
            />
          </>
        );
      };

      await renderWithSdk(<App />);
      await clickCell("Gizmo");
      await waitFor(() =>
        expect(getSqlQuestionCategoryValues().at(-1)).toEqual(["Gizmo"]),
      );
      await clickAppButton("Only Widget");

      await waitFor(() =>
        expect(getSqlQuestionCategoryValues().at(-1)).toEqual(["Widget"]),
      );
    });
  });

  describe("without an entry, the target works as before", () => {
    it("loads with the click values and the defaults of the other filters", async () => {
      setupEndpoints({
        clickBehavior: linkToTargetDashboard({ mapsCategory: true }),
      });

      await renderWithSdk(
        <InteractiveDashboard
          dashboardId={ROOT_DASHBOARD_ID}
          enableEntityNavigation
        />,
      );
      await openTargetDashboard();

      expect(getTargetQueryValues()).toEqual([
        {
          [CATEGORY_PARAMETER.id]: ["Gizmo"],
          [VENDOR_PARAMETER.id]: ["Acme"],
        },
      ]);
    });

    it("ignores the user's last used values when the click sets a filter", async () => {
      setupEndpoints({
        clickBehavior: linkToTargetDashboard({ mapsCategory: true }),
        targetLastUsedParameterValues: { [VENDOR_PARAMETER.id]: ["Globex"] },
      });
      const onNavigatedEntityParametersChange = jest.fn<
        void,
        [NavigatedEntityParameterChangePayload]
      >();

      await renderWithSdk(
        <InteractiveDashboard
          dashboardId={ROOT_DASHBOARD_ID}
          enableEntityNavigation
          onNavigatedEntityParametersChange={onNavigatedEntityParametersChange}
        />,
      );
      await openTargetDashboard();

      expect(getLastTargetQueryValues()).toEqual({
        [CATEGORY_PARAMETER.id]: ["Gizmo"],
        [VENDOR_PARAMETER.id]: ["Acme"],
      });
      await waitFor(() =>
        expect(onNavigatedEntityParametersChange).toHaveBeenCalledWith(
          expect.objectContaining({
            parameters: { category: ["Gizmo"], vendor: ["Acme"] },
            lastUsedParameters: { category: null, vendor: ["Globex"] },
          }),
        ),
      );
    });

    it("uses the user's last used values when the click sets no filter", async () => {
      setupEndpoints({
        clickBehavior: linkToTargetDashboard({ mapsCategory: false }),
        targetLastUsedParameterValues: { [VENDOR_PARAMETER.id]: ["Globex"] },
      });
      const onNavigatedEntityParametersChange = jest.fn<
        void,
        [NavigatedEntityParameterChangePayload]
      >();

      await renderWithSdk(
        <InteractiveDashboard
          dashboardId={ROOT_DASHBOARD_ID}
          enableEntityNavigation
          onNavigatedEntityParametersChange={onNavigatedEntityParametersChange}
        />,
      );
      await openTargetDashboard();

      expect(getLastTargetQueryValues()).toMatchObject({
        [VENDOR_PARAMETER.id]: ["Globex"],
      });
      await waitFor(() =>
        expect(onNavigatedEntityParametersChange).toHaveBeenCalledWith(
          expect.objectContaining({
            parameters: { category: null, vendor: ["Globex"] },
            clickParameters: {},
          }),
        ),
      );
    });
  });

  describe("back navigation", () => {
    it("keeps the navigation id and the host values, so the user's edits come back", async () => {
      setupEndpoints({
        clickBehavior: linkToTargetDashboard({ mapsCategory: true }),
      });
      const onNavigatedEntityParametersChange = jest.fn<
        void,
        [NavigatedEntityParameterChangePayload]
      >();

      const App = () => {
        const [navigatedEntityParameters, setNavigatedEntityParameters] =
          useState<NavigatedEntityParameters>({});

        return (
          <InteractiveDashboard
            dashboardId={ROOT_DASHBOARD_ID}
            enableEntityNavigation
            navigatedEntityParameters={navigatedEntityParameters}
            onNavigatedEntityParametersChange={(payload) => {
              onNavigatedEntityParametersChange(payload);
              setNavigatedEntityParameters((prev) => ({
                ...prev,
                [payload.navigationId]: payload.parameters,
              }));
            }}
          />
        );
      };

      await renderWithSdk(<App />);
      await openTargetDashboard();
      await waitFor(() =>
        expect(onNavigatedEntityParametersChange).toHaveBeenCalledTimes(1),
      );
      const [[initialState]] = onNavigatedEntityParametersChange.mock.calls;
      await typeInVendorFilter("Globex");
      await waitFor(() =>
        expect(getLastTargetQueryValues()).toMatchObject({
          [VENDOR_PARAMETER.id]: ["Globex"],
        }),
      );

      await clickCell("Widget");
      expect(await screen.findByText("Other text")).toBeInTheDocument();
      const queryCountBeforeBack = getTargetQueryValues().length;
      onNavigatedEntityParametersChange.mockClear();
      await userEvent.click(screen.getByLabelText("Back to Target"));

      await waitForTargetQueries(queryCountBeforeBack + 1);
      expect(getLastTargetQueryValues()).toEqual({
        [CATEGORY_PARAMETER.id]: ["Gizmo"],
        [VENDOR_PARAMETER.id]: ["Globex"],
      });
      await waitFor(() =>
        expect(onNavigatedEntityParametersChange).toHaveBeenCalledWith(
          expect.objectContaining({
            source: "initial-state",
            navigationId: initialState.navigationId,
            parameters: { category: ["Gizmo"], vendor: ["Globex"] },
            clickParameters: { category: ["Gizmo"] },
          }),
        ),
      );
    });

    it("starts a new visit when the user opens the same dashboard again", async () => {
      setupEndpoints({
        clickBehavior: linkToTargetDashboard({ mapsCategory: true }),
      });
      const onNavigatedEntityParametersChange = jest.fn<
        void,
        [NavigatedEntityParameterChangePayload]
      >();

      const App = () => {
        const [navigatedEntityParameters, setNavigatedEntityParameters] =
          useState<NavigatedEntityParameters>({});
        const [navigationId, setNavigationId] = useState<NavigationId | null>(
          null,
        );

        return (
          <>
            <button
              onClick={() =>
                navigationId &&
                setNavigatedEntityParameters((prev) => ({
                  ...prev,
                  [navigationId]: { vendor: ["Globex"] },
                }))
              }
            >
              Only Globex
            </button>
            <InteractiveDashboard
              dashboardId={ROOT_DASHBOARD_ID}
              enableEntityNavigation
              navigatedEntityParameters={navigatedEntityParameters}
              onNavigatedEntityParametersChange={(payload) => {
                onNavigatedEntityParametersChange(payload);
                setNavigationId(payload.navigationId);
              }}
            />
          </>
        );
      };

      await renderWithSdk(<App />);
      await openTargetDashboard();
      await waitFor(() =>
        expect(onNavigatedEntityParametersChange).toHaveBeenCalledTimes(1),
      );
      const [[firstVisit]] = onNavigatedEntityParametersChange.mock.calls;
      await clickAppButton("Only Globex");
      await waitForTargetQueries(2);

      await userEvent.click(screen.getByLabelText("Back to Root"));
      onNavigatedEntityParametersChange.mockClear();
      await clickCell("Gizmo");

      await waitForTargetQueries(3);
      expect(getLastTargetQueryValues()).toEqual({
        [CATEGORY_PARAMETER.id]: ["Gizmo"],
        [VENDOR_PARAMETER.id]: ["Acme"],
      });
      await waitFor(() =>
        expect(onNavigatedEntityParametersChange).toHaveBeenCalledTimes(1),
      );
      const [[secondVisit]] = onNavigatedEntityParametersChange.mock.calls;
      expect(secondVisit.navigationId).not.toBe(firstVisit.navigationId);
    });
  });
});
