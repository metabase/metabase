import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCreateCollectionEndpoint,
  setupUnauthorizedCollectionEndpoints,
} from "__support__/server-mocks";
import { screen, waitFor, within } from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { dayjs } from "metabase/dayjs";
import * as Urls from "metabase/urls";
import { checkNotNull } from "metabase/utils/types";
import {
  createMockCard,
  createMockCollection,
  createMockDashboard,
  createMockModelResult,
  createMockUser,
} from "metabase-types/api/mocks";

import {
  NESTED_COLLECTION,
  PERSONAL_COLLECTION_BASE,
  TEST_COLLECTION,
  setup,
  setupCollectionPage,
} from "./setup";

describe("nav > containers > MainNavbar", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("homepage link", () => {
    it("should render", async () => {
      await setup();
      const link = screen.getByRole("link", { name: /Home/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", "/");
    });

    it("should be highlighted if selected", async () => {
      await setup({ pathname: "/" });
      const link = screen.getByRole("listitem", { name: /Home/i });
      expect(link).toHaveAttribute("aria-selected", "true");
    });
  });

  describe("Getting Started section", () => {
    it("should not render if the instance was created more than 30 days ago", async () => {
      await setup({
        user: createMockUser({ is_superuser: true }),
        instanceCreationDate: dayjs().subtract(31, "days").toISOString(),
      });
      const section = screen.queryByRole("tab", {
        name: /^Getting Started/i,
      });
      const onboardingLink = screen.queryByRole("link", {
        name: /How to use Metabase/i,
      });

      expect(section).not.toBeInTheDocument();
      expect(onboardingLink).not.toBeInTheDocument();
    });

    it("should render if the instance was created less than 30 days ago", async () => {
      await setup({
        user: createMockUser({ is_superuser: true }),
        instanceCreationDate: dayjs().subtract(14, "days").toISOString(),
      });
      const section = screen.getByRole("tab", {
        name: /^Getting Started/i,
      });
      const onboardingLink = within(section).getByRole("link", {
        name: /How to use Metabase/i,
      });

      expect(section).toBeInTheDocument();
      expect(onboardingLink).toBeInTheDocument();
      expect(onboardingLink).toHaveAttribute("href", "/getting-started");
    });

    it("should not render if the instance is inside embedding iframe", async () => {
      await setup({
        user: createMockUser({ is_superuser: true }),
        isEmbeddingIframe: true,
      });
      const section = screen.queryByRole("tab", {
        name: /^Getting Started/i,
      });
      const onboardingLink = screen.queryByRole("link", {
        name: /How to use Metabase/i,
      });

      expect(section).not.toBeInTheDocument();
      expect(onboardingLink).not.toBeInTheDocument();
    });

    it.each(["admin", "non-admin"])("should render for %s", async (user) => {
      await setup({ user: createMockUser({ is_superuser: user === "admin" }) });
      const section = screen.getByRole("tab", {
        name: /^Getting Started/i,
      });
      expect(section).toBeInTheDocument();
    });

    it("should be expanded initially but collapsible", async () => {
      await setup({ user: createMockUser({ is_superuser: true }) });
      const sectionTitle = screen.getByRole("heading", {
        name: /Getting Started/i,
      });

      expect(sectionTitle).toBeInTheDocument();
      expect(screen.getByText(/How to use Metabase/i)).toBeInTheDocument();

      await userEvent.click(sectionTitle);
      expect(sectionTitle).toBeInTheDocument();
      expect(
        screen.queryByText(/How to use Metabase/i),
      ).not.toBeInTheDocument();
    });

    it("'How to use Metabase' link should be highlighted if selected", async () => {
      await setup({
        pathname: "/getting-started",
        user: createMockUser({ is_superuser: true }),
      });
      const link = screen.getByRole("listitem", {
        name: /How to use Metabase/i,
      });
      expect(link).toHaveAttribute("aria-selected", "true");
    });
  });

  describe("browse databases link", () => {
    it("should render", async () => {
      await setup();
      const listItem = screen.getByRole("listitem", {
        name: /Browse databases/i,
      });
      const link = within(listItem).getByRole("link");
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", "/browse/databases");
    });

    it("should not render when a user has no data access", async () => {
      await setup({ hasDataAccess: false });
      expect(
        screen.queryByRole("listitem", { name: /Browse databases/i }),
      ).not.toBeInTheDocument();
    });

    it("should be highlighted if selected", async () => {
      await setup({ pathname: "/browse/databases" });
      const listItem = screen.getByRole("listitem", {
        name: /Browse databases/i,
      });
      expect(listItem).toHaveAttribute("aria-selected", "true");
    });

    it("should be highlighted if child route selected", async () => {
      await setup({ pathname: "/browse/databases/1" });
      const listItem = screen.getByRole("listitem", {
        name: /Browse databases/i,
      });
      expect(listItem).toHaveAttribute("aria-selected", "true");
    });
  });

  describe("browse models link", () => {
    it("should render when there are models", async () => {
      await setup({ models: [createMockModelResult()] });
      const listItem = await screen.findByRole("listitem", {
        name: /Browse models/i,
      });
      const link = await within(listItem).findByRole("link");
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", "/browse/models");
    });

    it("should render when there are no models", async () => {
      await setup({ models: [] });
      expect(
        screen.getByRole("listitem", { name: /Browse models/i }),
      ).toBeInTheDocument();
    });

    it("should be highlighted if selected", async () => {
      await setup({
        models: [createMockModelResult()],
        pathname: "/browse/models",
      });
      const listItem = await screen.findByRole("listitem", {
        name: /Browse models/i,
      });
      expect(listItem).toHaveAttribute("aria-selected", "true");
    });
  });

  describe("collection tree", () => {
    it("should show collections", async () => {
      const {
        rootCollectionElements,
        personalCollectionElements,
        regularCollectionElements,
      } = await setupCollectionPage({ pathname: "/", route: "/" });

      expect(rootCollectionElements.link).toBeInTheDocument();
      expect(rootCollectionElements.link).toHaveAttribute(
        "href",
        Urls.collection(ROOT_COLLECTION),
      );
      expect(personalCollectionElements.link).toBeInTheDocument();
      expect(personalCollectionElements.link).toHaveAttribute(
        "href",
        Urls.collection(PERSONAL_COLLECTION_BASE),
      );
      expect(regularCollectionElements.link).toBeInTheDocument();
      expect(regularCollectionElements.link).toHaveAttribute(
        "href",
        Urls.collection(TEST_COLLECTION),
      );
    });

    it("should not highlight collections when not selected", async () => {
      const {
        rootCollectionElements,
        personalCollectionElements,
        regularCollectionElements,
      } = await setupCollectionPage({ pathname: "/", route: "/" });

      expect(rootCollectionElements.listItem).toHaveAttribute(
        "aria-selected",
        "false",
      );
      expect(personalCollectionElements.listItem).toHaveAttribute(
        "aria-selected",
        "false",
      );
      expect(regularCollectionElements.listItem).toHaveAttribute(
        "aria-selected",
        "false",
      );
    });

    it("should highlight regular collection if selected", async () => {
      const {
        rootCollectionElements,
        personalCollectionElements,
        regularCollectionElements,
      } = await setupCollectionPage({
        pathname: Urls.collection(TEST_COLLECTION),
      });

      expect(regularCollectionElements.listItem).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(rootCollectionElements.listItem).toHaveAttribute(
        "aria-selected",
        "false",
      );
      expect(personalCollectionElements.listItem).toHaveAttribute(
        "aria-selected",
        "false",
      );
    });

    it("should highlight root if selected", async () => {
      const {
        rootCollectionElements,
        personalCollectionElements,
        regularCollectionElements,
      } = await setupCollectionPage({
        pathname: Urls.collection(ROOT_COLLECTION),
      });

      expect(rootCollectionElements.listItem).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(regularCollectionElements.listItem).toHaveAttribute(
        "aria-selected",
        "false",
      );
      expect(personalCollectionElements.listItem).toHaveAttribute(
        "aria-selected",
        "false",
      );
    });

    it("should highlight personal collection if selected", async () => {
      const {
        rootCollectionElements,
        personalCollectionElements,
        regularCollectionElements,
      } = await setupCollectionPage({
        pathname: Urls.collection(PERSONAL_COLLECTION_BASE),
      });

      expect(personalCollectionElements.listItem).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(rootCollectionElements.listItem).toHaveAttribute(
        "aria-selected",
        "false",
      );
      expect(regularCollectionElements.listItem).toHaveAttribute(
        "aria-selected",
        "false",
      );
    });

    it("should highlight question's collection if selected", async () => {
      const card = createMockCard({
        // Unjustified type cast. FIXME
        collection_id: TEST_COLLECTION.id as number,
      });
      await setup({
        openQuestionCard: card,
        route: "/question/:slug",
        pathname: `/question/${card.id}`,
      });

      expect(
        screen.getByRole("treeitem", { name: /Test collection/i }),
      ).toHaveAttribute("aria-selected", "true");
      expect(
        screen.getByRole("treeitem", { name: /Our analytics/i }),
      ).toHaveAttribute("aria-selected", "false");
    });

    it("should highlight dashboard's collection if selected", async () => {
      const dashboard = createMockDashboard({
        // Unjustified type cast. FIXME
        collection_id: TEST_COLLECTION.id as number,
      });
      await setup({
        openDashboard: dashboard,
        route: "/dashboard/:slug",
        pathname: `/dashboard/${dashboard.id}`,
      });

      expect(
        screen.getByRole("treeitem", { name: /Test collection/i }),
      ).toHaveAttribute("aria-selected", "true");
      expect(
        screen.getByRole("treeitem", { name: /Our analytics/i }),
      ).toHaveAttribute("aria-selected", "false");
    });

    it("should highlight model's collection when on model detail page", async () => {
      const model = createMockCard({
        // Unjustified type cast. FIXME
        collection_id: TEST_COLLECTION.id as number,
        type: "model",
      });
      await setup({
        route: "/model/:slug/detail",
        pathname: `/model/${model.id}/detail`,
        openQuestionCard: model,
      });

      expect(
        screen.getByRole("treeitem", { name: /Test collection/i }),
      ).toHaveAttribute("aria-selected", "true");
      expect(
        screen.getByRole("treeitem", { name: /Our analytics/i }),
      ).toHaveAttribute("aria-selected", "false");

      expect(
        screen.getByRole("button", { name: "Create a new collection" }),
      ).toBeInTheDocument();
    });

    it("should not display the new collection button if a user has no write permissions", async () => {
      await setup({
        user: createMockUser({ can_write_any_collection: false }),
      });

      expect(
        await screen.findByRole("treeitem", { name: /Our analytics/i }),
      ).toBeInTheDocument();

      expect(
        screen.queryByRole("button", { name: "Create a new collection" }),
      ).not.toBeInTheDocument();
    });

    it("should create a collection in the personal collection for a user without collection access", async () => {
      // Registered before `setup` so it wins: the API 403s the root collection
      // for a user without any collection access.
      setupUnauthorizedCollectionEndpoints(
        createMockCollection(ROOT_COLLECTION),
      );
      setupCreateCollectionEndpoint(
        createMockCollection({ id: 42, name: "Foo" }),
      );
      const { router } = await setup({
        route: "*",
        canCurateRootCollection: false,
      });

      const button = screen.getByRole("button", {
        name: "Create a new collection",
      });
      expect(button).toBeInTheDocument();
      await userEvent.click(button);

      const modal = await screen.findByTestId("new-collection-modal");
      await userEvent.type(within(modal).getByLabelText("Name"), "Foo");
      await waitFor(() =>
        expect(
          within(modal).getByTestId("collection-picker-button"),
        ).toHaveTextContent(PERSONAL_COLLECTION_BASE.name),
      );
      await userEvent.click(
        within(modal).getByRole("button", { name: "Create" }),
      );

      await waitFor(() =>
        expect(router?.location.pathname).toBe("/collection/42-foo"),
      );
      const request = fetchMock.callHistory.lastCall("create-collection");
      expect(
        await new Request(request?.url ?? "", request?.options).json(),
      ).toMatchObject({
        name: "Foo",
        parent_id: PERSONAL_COLLECTION_BASE.id,
      });
    });

    it("should move focus through the new collection modal with Tab (#83338)", async () => {
      await setup();

      await userEvent.click(
        screen.getByRole("button", { name: "Create a new collection" }),
      );

      const modal = await screen.findByRole("dialog", {
        name: "New collection",
      });
      await waitFor(() => {
        expect(within(modal).getByLabelText("Name")).toHaveFocus();
      });

      await userEvent.tab();
      expect(within(modal).getByLabelText("Description")).toHaveFocus();
    });

    it("should toggle active collection on click", async () => {
      const { regularCollectionElements } = await setupCollectionPage({
        pathname: Urls.collection(TEST_COLLECTION),
        route: "/collection/:slug",
      });

      expect(regularCollectionElements.listItem).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(
        screen.getByRole("treeitem", { name: /Nested collection/i }),
      ).toBeInTheDocument();

      await userEvent.click(regularCollectionElements.listItem);
      expect(
        screen.queryByRole("treeitem", { name: /Nested collection/i }),
      ).not.toBeInTheDocument();

      await userEvent.click(regularCollectionElements.listItem);
      expect(
        screen.getByRole("treeitem", { name: /Nested collection/i }),
      ).toBeInTheDocument();
    });

    it("should not toggle inactive collection on click", async () => {
      const { regularCollectionElements } = await setupCollectionPage({
        pathname: Urls.collection(NESTED_COLLECTION),
        route: "/collection/:slug",
      });

      expect(regularCollectionElements.listItem).toHaveAttribute(
        "aria-selected",
        "false",
      );
      expect(
        screen.getByRole("treeitem", { name: /Nested collection/i }),
      ).toBeInTheDocument();

      await userEvent.click(regularCollectionElements.listItem);
      expect(
        screen.getByRole("treeitem", { name: /Nested collection/i }),
      ).toBeInTheDocument();
    });

    it("should toggle inactive collection via the chevron button", async () => {
      const { regularCollectionElements } = await setupCollectionPage({
        pathname: Urls.collection(PERSONAL_COLLECTION_BASE),
        route: "/collection/:slug",
      });

      expect(regularCollectionElements.listItem).toHaveAttribute(
        "aria-selected",
        "false",
      );
      expect(
        screen.queryByRole("treeitem", { name: /Nested collection/i }),
      ).not.toBeInTheDocument();

      const chevron = within(regularCollectionElements.listItem).getByRole(
        "button",
      );
      await userEvent.click(chevron);
      expect(
        screen.getByRole("treeitem", { name: /Nested collection/i }),
      ).toBeInTheDocument();
    });
  });

  describe("trash", () => {
    const TRASH_COLLECTION = createMockCollection({
      id: 20000000,
      name: "Trash",
      type: "trash",
      // The trash link must not become expandable, even if the API returns
      // children for it.
      children: [
        createMockCollection({ id: 30, name: "Trashed child", archived: true }),
      ],
    });

    const TRASHED_COLLECTION = createMockCollection({
      id: 5,
      name: "Trashed collection",
      archived: true,
    });

    const getTrashItem = () => screen.getByRole("treeitem", { name: /Trash/i });
    const getRegularCollectionItem = () =>
      screen.getByRole("treeitem", { name: /Test collection/i });

    it("should show the trash as the last collection link, without an expand toggle", async () => {
      await setup({ trashCollection: TRASH_COLLECTION });

      const collectionLinks = screen.getAllByTestId(
        "sidebar-collection-link-root",
      );
      const trashLink = collectionLinks.at(-1);
      expect(trashLink).toHaveTextContent("Trash");
      expect(collectionLinks.at(0)).not.toHaveTextContent("Trash");
      expect(
        within(checkNotNull(trashLink)).getByLabelText("chevronright icon"),
      ).not.toBeVisible();
      expect(screen.queryByText("Trashed child")).not.toBeInTheDocument();
    });

    it("should highlight the trash when viewing the trash", async () => {
      await setup({
        trashCollection: TRASH_COLLECTION,
        route: "/trash",
        pathname: "/trash",
      });

      expect(getTrashItem()).toHaveAttribute("aria-selected", "true");
      expect(
        screen.getByRole("treeitem", { name: /Our analytics/i }),
      ).toHaveAttribute("aria-selected", "false");
    });

    it("should highlight the trash when viewing a trashed collection", async () => {
      await setup({
        trashCollection: TRASH_COLLECTION,
        extraCollections: [TRASHED_COLLECTION],
        route: "/collection/:slug",
        pathname: Urls.collection(TRASHED_COLLECTION),
      });

      await waitFor(() => {
        expect(getTrashItem()).toHaveAttribute("aria-selected", "true");
      });
      expect(getRegularCollectionItem()).toHaveAttribute(
        "aria-selected",
        "false",
      );
    });

    it("should highlight the trash instead of the collection of a trashed dashboard", async () => {
      const dashboard = createMockDashboard({
        collection_id: Number(TEST_COLLECTION.id),
        archived: true,
      });
      await setup({
        trashCollection: TRASH_COLLECTION,
        openDashboard: dashboard,
        route: "/dashboard/:slug",
        pathname: `/dashboard/${dashboard.id}`,
      });

      expect(getTrashItem()).toHaveAttribute("aria-selected", "true");
      expect(getRegularCollectionItem()).toHaveAttribute(
        "aria-selected",
        "false",
      );
    });

    it("should highlight the trash instead of the collection of a trashed question", async () => {
      const card = createMockCard({
        collection_id: Number(TEST_COLLECTION.id),
        archived: true,
      });
      await setup({
        trashCollection: TRASH_COLLECTION,
        openQuestionCard: card,
        route: "/question/:slug",
        pathname: `/question/${card.id}`,
      });

      await waitFor(() => {
        expect(getTrashItem()).toHaveAttribute("aria-selected", "true");
      });
      expect(getRegularCollectionItem()).toHaveAttribute(
        "aria-selected",
        "false",
      );
    });
  });

  describe("collection tree navigation (metabase#17339)", () => {
    const DEEP_COLLECTION = createMockCollection({
      id: 13,
      name: "Deep collection",
      location: "/11/12/",
      parent_id: 12,
      children: [],
    });
    const MIDDLE_COLLECTION = createMockCollection({
      id: 12,
      name: "Middle collection",
      location: "/11/",
      parent_id: 11,
      children: [DEEP_COLLECTION],
    });
    const TOP_COLLECTION = createMockCollection({
      id: 11,
      name: "Top collection",
      location: "/",
      children: [MIDDLE_COLLECTION],
    });

    function getTreeItem(name: string) {
      return screen.getByRole("treeitem", { name: new RegExp(name) });
    }

    function queryTreeItem(name: string) {
      return screen.queryByRole("treeitem", { name: new RegExp(name) });
    }

    function getTreeLink(name: string) {
      return within(getTreeItem(name)).getByRole("link");
    }

    function getExpandToggle(name: string) {
      return within(getTreeItem(name)).getByRole("button", { hidden: true });
    }

    it("expands with the chevron without navigating, and toggles a collection only once it is open", async () => {
      await setup({
        pathname: Urls.collection(ROOT_COLLECTION),
        route: "/collection/:slug",
        collections: [TOP_COLLECTION],
      });

      await userEvent.click(getExpandToggle(TOP_COLLECTION.name));
      expect(getTreeItem(MIDDLE_COLLECTION.name)).toBeInTheDocument();
      expect(queryTreeItem(DEEP_COLLECTION.name)).not.toBeInTheDocument();
      expect(getTreeItem("Our analytics")).toHaveAttribute(
        "aria-selected",
        "true",
      );

      await userEvent.click(getTreeLink(MIDDLE_COLLECTION.name));
      expect(getTreeItem(MIDDLE_COLLECTION.name)).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(getTreeItem(DEEP_COLLECTION.name)).toBeInTheDocument();

      await userEvent.click(getTreeLink(MIDDLE_COLLECTION.name));
      expect(queryTreeItem(DEEP_COLLECTION.name)).not.toBeInTheDocument();

      await userEvent.click(getTreeLink(TOP_COLLECTION.name));
      expect(getTreeItem(TOP_COLLECTION.name)).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(getTreeItem(MIDDLE_COLLECTION.name)).toBeInTheDocument();

      await userEvent.click(getTreeLink(TOP_COLLECTION.name));
      expect(queryTreeItem(MIDDLE_COLLECTION.name)).not.toBeInTheDocument();
      expect(queryTreeItem(DEEP_COLLECTION.name)).not.toBeInTheDocument();
    });

    it("opens a directly visited collection, shows a chevron only for collections with children, and creates new collections inside it", async () => {
      await setup({
        pathname: Urls.collection(MIDDLE_COLLECTION),
        route: "/collection/:slug",
        collections: [TOP_COLLECTION],
      });

      expect(getTreeItem(MIDDLE_COLLECTION.name)).toBeInTheDocument();
      expect(getTreeItem(DEEP_COLLECTION.name)).toBeInTheDocument();
      expect(getExpandToggle(MIDDLE_COLLECTION.name)).toBeVisible();
      // Collections without children have no chevron (metabase#14753)
      expect(getExpandToggle(DEEP_COLLECTION.name)).not.toBeVisible();
      expect(getExpandToggle("Your personal collection")).not.toBeVisible();

      await userEvent.click(
        screen.getByRole("button", { name: "Create a new collection" }),
      );
      const modal = await screen.findByRole("dialog", {
        name: "New collection",
      });
      expect(
        within(modal).getByText("Collection it's saved in"),
      ).toBeInTheDocument();
      expect(
        await within(modal).findByTestId("collection-picker-button"),
      ).toHaveTextContent(MIDDLE_COLLECTION.name);
    });
  });

  describe("Personal Collections", () => {
    it("non-admin should see not other users personal collections", async () => {
      await setup({});

      expect(
        screen.queryByText(/Other users' personal collections/i),
      ).not.toBeInTheDocument();
    });

    it("admin should see other users personal collections if there other users", async () => {
      await setup({
        user: createMockUser({ is_superuser: true }),
      });
      expect(
        await screen.findByText(/Other users' personal collections/i),
      ).toBeInTheDocument();
    });

    it("should select other users' personal collections when viewing them (#79967)", async () => {
      await setup({
        pathname: Urls.otherUsersPersonalCollections(),
        route: "/collection/:slug",
        user: createMockUser({ is_superuser: true }),
      });

      const listItem = screen.getByRole("listitem", {
        name: /Other users' personal collections/i,
      });
      expect(listItem).toHaveAttribute("aria-selected", "true");
    });

    it("should not select other users' personal collections when viewing another collection (#79967)", async () => {
      await setup({
        pathname: Urls.collection(TEST_COLLECTION),
        route: "/collection/:slug",
        user: createMockUser({ is_superuser: true }),
      });

      const listItem = screen.getByRole("listitem", {
        name: /Other users' personal collections/i,
      });
      expect(listItem).toHaveAttribute("aria-selected", "false");
    });

    it("admin not should see other users personal collections if there no other users", async () => {
      await setup({
        user: createMockUser({ is_superuser: true }),
        activeUsersCount: 1,
      });
      expect(
        await screen.findByRole("treeitem", {
          name: /Your personal collection/i,
        }),
      ).toBeVisible();
      expect(
        screen.queryByText(/Other users' personal collections/i),
      ).not.toBeInTheDocument();
    });
  });
});
