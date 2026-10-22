import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupPropertiesEndpoints,
  setupRecentViewsEndpoints,
  setupSearchEndpoints,
  setupSearchErrorEndpoint,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { createMockSetupState } from "__support__/state";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { Route } from "metabase/router";
import { settingsApi } from "metabase/settings";
import {
  createMockCollection,
  createMockSearchResult,
  createMockSettings,
  createMockUser,
  createMockUserPermissions,
} from "metabase-types/api/mocks";

import { BrowseModels } from "./BrowseModels";
import { createMockModelResult, createMockRecentModel } from "./test-utils";

const defaultRootCollection = createMockCollection({
  id: "root",
  name: "Our analytics",
});

interface SetupOptions {
  modelCount: number;
  recentModelCount?: number;
  hasDataPermissions?: boolean;
  searchError?: boolean;
}

const setup = ({
  modelCount,
  recentModelCount = 5,
  hasDataPermissions = true,
  searchError = false,
}: SetupOptions) => {
  const mockModelResults = mockModels.map((model) =>
    createMockModelResult(model),
  );
  const mockRecentModels = mockModels
    .slice(0, recentModelCount)
    .map((model) => createMockRecentModel(model));
  const models = mockModelResults.slice(0, modelCount);
  if (searchError) {
    setupSearchErrorEndpoint();
  } else {
    setupSearchEndpoints(models.map((model) => createMockSearchResult(model)));
  }
  setupSettingsEndpoints([]);
  setupRecentViewsEndpoints(mockRecentModels);
  return renderWithProviders(
    <>
      <Route path="/" element={<BrowseModels />} />
      <Route
        path="/model/:slug"
        element={<div data-testid="model-detail-page" />}
      />
    </>,
    {
      storeInitialState: {
        currentUser: createMockUser({
          permissions: createMockUserPermissions({
            can_create_queries: hasDataPermissions,
            can_create_native_queries: hasDataPermissions,
          }),
        }),
        setup: createMockSetupState({
          locale: { name: "English", code: "en" },
        }),
      },
      withRouter: true,
    },
  );
};

const collectionAlpha = createMockCollection({ id: 99, name: "Alpha" });
const collectionBeta = createMockCollection({
  id: 1,
  name: "Beta",
  effective_ancestors: [collectionAlpha],
});
const collectionCharlie = createMockCollection({
  id: 2,
  name: "Charlie",
  effective_ancestors: [collectionAlpha, collectionBeta],
});
const collectionDelta = createMockCollection({
  id: 3,
  name: "Delta",
  effective_ancestors: [collectionAlpha, collectionBeta, collectionCharlie],
});
const collectionZulu = createMockCollection({
  id: 4,
  name: "Zulu",
  effective_ancestors: [
    collectionAlpha,
    collectionBeta,
    collectionCharlie,
    collectionDelta,
  ],
});
const collectionAngstrom = createMockCollection({
  id: 5,
  name: "Ångström",
  effective_ancestors: [
    collectionAlpha,
    collectionBeta,
    collectionCharlie,
    collectionDelta,
    collectionZulu,
  ],
});
const collectionOzgur = createMockCollection({
  id: 6,
  name: "Özgür",
  effective_ancestors: [
    collectionAlpha,
    collectionBeta,
    collectionCharlie,
    collectionDelta,
    collectionZulu,
    collectionAngstrom,
  ],
});
const collectionGrande = createMockCollection({
  id: 7,
  name: "Grande",
  effective_ancestors: [
    collectionAlpha,
    collectionBeta,
    collectionCharlie,
    collectionDelta,
    collectionZulu,
    collectionAngstrom,
    collectionOzgur,
  ],
});

const mockModels = [
  {
    id: 0,
    name: "Model 0",
    collection: collectionAlpha,
    last_editor_common_name: "Bobby",
    last_edited_at: "2024-12-15T11:59:59.000Z",
  },
  {
    id: 1,
    name: "Model 1",
    collection: collectionAlpha,
    last_editor_common_name: "Bobby",
    last_edited_at: "2024-12-15T11:59:30.000Z",
  },
  {
    id: 2,
    name: "Model 2",
    collection: collectionAlpha,
    last_editor_common_name: "Bobby",
    last_edited_at: "2024-12-15T11:59:00.000Z",
  },
  {
    id: 3,
    name: "Model 3",
    collection: collectionBeta,
    last_editor_common_name: "Bobby",
    last_edited_at: "2024-12-15T11:50:00.000Z",
  },
  {
    id: 4,
    name: "Model 4",
    collection: collectionBeta,
    last_editor_common_name: "Bobby",
    last_edited_at: "2024-12-15T11:00:00.000Z",
  },
  {
    id: 5,
    name: "Model 5",
    collection: collectionBeta,
    last_editor_common_name: "Bobby",
    last_edited_at: "2024-12-14T22:00:00.000Z",
  },
  {
    id: 6,
    name: "Model 6",
    collection: collectionCharlie,
    last_editor_common_name: "Bobby",
    last_edited_at: "2024-12-14T12:00:00.000Z",
  },
  {
    id: 7,
    name: "Model 7",
    collection: collectionCharlie,
    last_editor_common_name: "Bobby",
    last_edited_at: "2024-12-10T12:00:00.000Z",
  },
  {
    id: 8,
    name: "Model 8",
    collection: collectionCharlie,
    last_editor_common_name: "Bobby",
    last_edited_at: "2024-11-15T12:00:00.000Z",
  },
  {
    id: 9,
    name: "Model 9",
    collection: collectionDelta,
    last_editor_common_name: "Bobby",
    last_edited_at: "2024-02-15T12:00:00.000Z",
  },
  {
    id: 10,
    name: "Model 10",
    collection: collectionDelta,
    last_editor_common_name: "Bobby",
    last_edited_at: "2023-12-15T12:00:00.000Z",
  },
  {
    id: 11,
    name: "Model 11",
    collection: collectionDelta,
    last_editor_common_name: "Bobby",
    last_edited_at: "2020-01-01T00:00:00.000Z",
  },
  {
    id: 12,
    name: "Model 12",
    collection: collectionZulu,
    last_editor_common_name: "Bobby",
    last_edited_at: "2000-01-01T00:00:00.000Z",
  },
  {
    id: 13,
    name: "Model 13",
    collection: collectionZulu,
    last_editor_common_name: "Bobby",
    last_edited_at: "2000-01-01T00:00:00.000Z",
  },
  {
    id: 14,
    name: "Model 14",
    collection: collectionZulu,
    last_editor_common_name: "Bobby",
    last_edited_at: "2000-01-01T00:00:00.000Z",
  },
  {
    id: 15,
    name: "Model 15",
    collection: collectionAngstrom,
    last_editor_common_name: "Bobby",
    last_edited_at: "2000-01-01T00:00:00.000Z",
  },
  {
    id: 16,
    name: "Model 16",
    collection: collectionAngstrom,
    last_editor_common_name: "Bobby",
    last_edited_at: "2000-01-01T00:00:00.000Z",
  },
  {
    id: 17,
    name: "Model 17",
    collection: collectionAngstrom,
    last_editor_common_name: "Bobby",
    last_edited_at: "2000-01-01T00:00:00.000Z",
  },
  {
    id: 18,
    name: "Model 18",
    collection: collectionOzgur,
    last_editor_common_name: "Bobby",
    last_edited_at: "2000-01-01T00:00:00.000Z",
  },
  {
    id: 19,
    name: "Model 19",
    collection: collectionOzgur,
    last_editor_common_name: "Bobby",
    last_edited_at: "2000-01-01T00:00:00.000Z",
  },
  {
    id: 20,
    name: "Model 20",
    collection: collectionOzgur,
    last_editor_common_name: "Bobby",
    last_edited_at: "2000-01-01T00:00:00.000Z",
  },
  {
    id: 21,
    name: "Model 21",
    collection: defaultRootCollection, // Our analytics
    last_editor_common_name: "Bobby",
    last_edited_at: "2000-01-01T00:00:00.000Z",
  },
  {
    id: 22,
    name: "Model 22",
    collection: defaultRootCollection, // Our analytics
    last_editor_common_name: "Bobby",
    last_edited_at: "2000-01-01T00:00:00.000Z",
  },
  ...new Array(100).fill(null).map((_, i) => {
    return {
      id: i + 300,
      name: `Model ${i + 300}`,
      collection: collectionGrande,
      last_editor_common_name: "Bobby",
      last_edited_at: "2000-01-01T00:00:00.000Z",
    };
  }),
];

describe("BrowseModels", () => {
  describe("Empty state", () => {
    it("displays an explanation about how to use models when no models exist", async () => {
      setup({ modelCount: 0 });

      const emptyState = await screen.findByTestId("empty-state");
      const title =
        "Create models to clean up and combine tables to make your data easier to explore";
      const description =
        "Models are somewhat like virtual tables: do all your joins and custom columns once, save it as a model, then query it like a table.";

      expect(await within(emptyState).findByText(title)).toBeInTheDocument();
      expect(
        await within(emptyState).findByText(description),
      ).toBeInTheDocument();

      expect(
        await within(emptyState).findByRole("link", { name: "Read the docs" }),
      ).toHaveAttribute(
        "href",
        "https://www.metabase.com/docs/latest/data-modeling/models.html",
      );
    });

    it("should display embedded YouTube video (that doesn't auto play) when no models exist", async () => {
      setup({ modelCount: 0 });

      const emptyState = await screen.findByTestId("empty-state");
      const youtubeVideo = await within(emptyState).findByTitle(
        "Use Models in Metabase | Getting started with Metabase",
      );
      expect(youtubeVideo).toBeInTheDocument();
      expect(youtubeVideo).toHaveAttribute("src");

      const src = youtubeVideo.getAttribute("src");
      expect(src).toContain("youtube.com");
      expect(src).toContain("autoplay=0");
    });

    it("shows the empty state without the explanation banner when no models exist (models empty states)", async () => {
      setup({ modelCount: 0 });

      const emptyState = await screen.findByTestId("empty-state");
      expect(
        within(emptyState).getByRole("heading", {
          name: "Create models to clean up and combine tables to make your data easier to explore",
        }),
      ).toBeInTheDocument();
      expect(
        within(emptyState).getByTitle(
          "Use Models in Metabase | Getting started with Metabase",
        ),
      ).toBeInTheDocument();
      expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    });

    it("should display a new model button in the header along when in empty state", async () => {
      setup({ modelCount: 0, hasDataPermissions: true });
      const newModelButton = await screen.findByLabelText("Create a new model");
      expect(newModelButton).toBeInTheDocument();
    });

    it("should not display a new model button in the header when in empty state if the user lacks data permissions", async () => {
      setup({ modelCount: 0, hasDataPermissions: false });
      const header = await screen.findByTestId("browse-models-header");
      expect(
        within(header).queryByLabelText("Create a new model"),
      ).not.toBeInTheDocument();
    });
  });

  describe("Models explanation banner", () => {
    it("displays an explanation banner when there is at least one model", async () => {
      setup({ modelCount: 1 });

      const banner = await screen.findByRole("complementary");
      const title =
        "Create models to clean up and combine tables to make your data easier to explore";
      const description =
        "Models are somewhat like virtual tables: do all your joins and custom columns once, save it as a model, then query it like a table.";

      expect(await within(banner).findByText(title)).toBeInTheDocument();
      expect(await within(banner).findByText(description)).toBeInTheDocument();

      expect(
        await within(banner).findByRole("link", { name: "Read the docs" }),
      ).toHaveAttribute(
        "href",
        "https://www.metabase.com/docs/latest/data-modeling/models.html",
      );

      const dismissButton = await within(banner).findByRole("button", {
        name: "Dismiss",
      });
      expect(dismissButton).toBeInTheDocument();
    });

    it("hides the explanation banner and saves the dismissal when Dismiss is clicked (models empty states)", async () => {
      setupPropertiesEndpoints(createMockSettings());
      setupUpdateSettingEndpoint();
      const { store } = setup({ modelCount: 1 });
      await store.dispatch(
        settingsApi.endpoints.getSessionProperties.initiate(),
      );

      await screen.findByRole("table", { name: /Table of models/ });
      const banner = screen.getByRole("complementary");
      await userEvent.click(
        within(banner).getByRole("button", { name: "Dismiss" }),
      );

      await waitFor(() =>
        expect(screen.queryByRole("complementary")).not.toBeInTheDocument(),
      );
      const settingUrl = "path:/api/setting/dismissed-browse-models-banner";
      await waitFor(() =>
        expect(
          fetchMock.callHistory.called(settingUrl, { method: "PUT" }),
        ).toBe(true),
      );
      const call = fetchMock.callHistory.lastCall(settingUrl, {
        method: "PUT",
      });
      const body: unknown = JSON.parse(String(call?.options.body));
      expect(body).toEqual({ value: true });
      expect(
        screen.getByRole("table", { name: /Table of models/ }),
      ).toBeInTheDocument();
    });

    it("explanation banner can open an autoplaying embedded YouTube video in a modal", async () => {
      setup({ modelCount: 1 });

      const banner = await screen.findByRole("complementary");
      const videoThumbnail = await within(banner).findByTestId(
        "browse-models-video-thumbnail",
      );
      const videoTitle =
        "Use Models in Metabase | Getting started with Metabase";

      expect(videoThumbnail).toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.queryByTitle(videoTitle)).not.toBeInTheDocument();

      await userEvent.click(videoThumbnail);
      const modal = await screen.findByRole("dialog");
      const youtubeVideo = await within(modal).findByTitle(videoTitle);
      expect(modal).toBeInTheDocument();
      expect(youtubeVideo).toBeInTheDocument();
      expect(youtubeVideo).toHaveAttribute("src");

      const src = youtubeVideo.getAttribute("src");
      expect(src).toContain("youtube.com");
      expect(src).toContain("autoplay=1");
    });

    it("should display a new model button in the header along when a model explanation banner", async () => {
      setup({ modelCount: 1, hasDataPermissions: true });
      const newModelButton = await screen.findByLabelText("Create a new model");
      expect(newModelButton).toBeInTheDocument();
    });

    it("should not display a new model button in the header along the model explanation banner if the user lacks data permission", async () => {
      setup({ modelCount: 1, hasDataPermissions: false });
      const header = await screen.findByTestId("browse-models-header");
      expect(
        within(header).queryByLabelText("Create a new model"),
      ).not.toBeInTheDocument();
    });
  });

  it("displays the Our Analytics collection if it has a model", async () => {
    setup({ modelCount: 25 });
    const modelsTable = await screen.findByRole("table", {
      name: /Table of models/,
    });
    expect(modelsTable).toBeInTheDocument();
    expect(
      await within(modelsTable).findAllByTestId(
        "path-for-collection: Our analytics",
      ),
    ).toHaveLength(2);
    expect(
      await within(modelsTable).findByText("Model 20"),
    ).toBeInTheDocument();
    expect(
      await within(modelsTable).findByText("Model 21"),
    ).toBeInTheDocument();
    expect(
      await within(modelsTable).findByText("Model 22"),
    ).toBeInTheDocument();
  });

  it("displays collection breadcrumbs", async () => {
    setup({ modelCount: 25 });
    const modelsTable = await screen.findByRole("table", {
      name: /Table of models/,
    });
    expect(await within(modelsTable).findByText("Model 1")).toBeInTheDocument();
    expect(
      await within(modelsTable).findAllByTestId("path-for-collection: Alpha"),
    ).toHaveLength(3);
  });

  it("displays recently viewed models", async () => {
    setup({ modelCount: 25 });
    const recentModelsGrid = await screen.findByRole("grid", {
      name: /Recents/,
    });
    expect(recentModelsGrid).toBeInTheDocument();
    expect(
      await within(recentModelsGrid).findByText("Model 1"),
    ).toBeInTheDocument();
    expect(
      await within(recentModelsGrid).findByText("Model 2"),
    ).toBeInTheDocument();
    expect(
      await within(recentModelsGrid).findByText("Model 3"),
    ).toBeInTheDocument();
    expect(
      await within(recentModelsGrid).findByText("Model 4"),
    ).toBeInTheDocument();
    expect(
      within(recentModelsGrid).queryByText("Model 5"),
    ).not.toBeInTheDocument();
  });

  it("displays no recently viewed models when there are fewer than 9 models - but instance analytics models do not count", async () => {
    setup({ modelCount: 8 });
    const recentModelsGrid = screen.queryByRole("grid", {
      name: /Recents/,
    });
    expect(recentModelsGrid).not.toBeInTheDocument();
  });

  it("should render links that point directly to /model/{id}-{slug} (metabase#55166)", async () => {
    const { router } = setup({ modelCount: 25 });
    const recentModelsGrid = await screen.findByRole("grid", {
      name: /Recents/,
    });
    expect(
      within(recentModelsGrid).getByRole("link", { name: /Model 1/ }),
    ).toHaveAttribute("href", "/model/1-model-1");
    expect(
      within(recentModelsGrid).getByRole("link", { name: /Model 2/ }),
    ).toHaveAttribute("href", "/model/2-model-2");

    const modelsTable = await screen.findByRole("table", {
      name: /Table of models/,
    });

    expect(
      within(modelsTable).getByRole("link", { name: /Model 20/ }),
    ).toHaveAttribute("href", "/model/20-model-20");
    expect(
      within(modelsTable).getByRole("link", { name: /Model 21/ }),
    ).toHaveAttribute("href", "/model/21-model-21");

    expect(screen.queryByTestId("model-detail-page")).not.toBeInTheDocument();
    await userEvent.click(within(recentModelsGrid).getByText("Model 1"));
    expect(screen.getByTestId("model-detail-page")).toBeInTheDocument();
    expect(router?.location.pathname).toBe("/model/1-model-1");
  });

  it("shows an error in the recents and the table when the search request fails (browse models search error)", async () => {
    setup({ modelCount: 25, searchError: true });

    const page = screen.getByLabelText("Models");
    expect(await within(page).findAllByText("An error occurred")).toHaveLength(
      2,
    );
    expect(screen.queryByTestId("empty-state")).not.toBeInTheDocument();
  });

  describe("modifier-click on a table row", () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it.each(["Meta", "Control"])(
      "opens the model in a new tab when the %s key is held (meta-click new tab)",
      async (modifierKey) => {
        const openSpy = jest
          .spyOn(window, "open")
          .mockImplementation(() => null);
        const { router } = setup({ modelCount: 2 });
        const { keyboard, click } = userEvent.setup();
        const modelsTable = await screen.findByRole("table", {
          name: /Table of models/,
        });

        await keyboard(`{${modifierKey}>}`);
        await click(within(modelsTable).getByText("Model 1"));
        await keyboard(`{/${modifierKey}}`);

        expect(openSpy).toHaveBeenCalledTimes(1);
        expect(openSpy).toHaveBeenCalledWith("/model/1-model-1", "_blank");
        expect(
          screen.queryByTestId("model-detail-page"),
        ).not.toBeInTheDocument();
        expect(router?.location.pathname).toBe("/");
      },
    );
  });
});
