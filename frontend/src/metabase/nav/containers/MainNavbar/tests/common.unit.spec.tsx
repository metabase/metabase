import dayjs from "dayjs";

import { screen, within } from "__support__/ui";
import { createMockModelResult } from "metabase/browse/models/test-utils";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import * as Urls from "metabase/lib/urls";
import {
  createMockCard,
  createMockDashboard,
  createMockUser,
} from "metabase-types/api/mocks";

import {
  PERSONAL_COLLECTION_BASE,
  TEST_COLLECTION,
  setup,
  setupCollectionPage,
} from "./setup";

describe("nav > containers > MainNavbar", () => {
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

  describe("how to use Metabase", () => {
    it.each(["admin", "non-admin"])("should render for %s", async user => {
      await setup({ user: createMockUser({ is_superuser: user === "admin" }) });
      const link = screen.getByRole("link", { name: /How to use Metabase/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", "/getting-started");
    });

    it("should be highlighted if selected", async () => {
      await setup({
        pathname: "/getting-started",
        user: createMockUser({ is_superuser: true }),
      });
      const link = screen.getByRole("listitem", {
        name: /How to use Metabase/i,
      });
      expect(link).toHaveAttribute("aria-selected", "true");
    });

    it("should render if the instance was created less than 30 days ago", async () => {
      await setup({
        user: createMockUser({ is_superuser: true }),
        instanceCreationDate: dayjs().subtract(14, "days").toISOString(),
      });
      const link = screen.getByRole("link", { name: /How to use Metabase/i });
      expect(link).toBeInTheDocument();
    });

    it("should not render if the instance was created more than 30 days ago", async () => {
      await setup({
        user: createMockUser({ is_superuser: true }),
        instanceCreationDate: dayjs().subtract(31, "days").toISOString(),
      });
      const link = screen.queryByRole("link", { name: /How to use Metabase/i });
      expect(link).not.toBeInTheDocument();
    });
  });

  describe("DWH Upload CSV", () => {
    it("should not render 'upload CSV' button", () => {
      setup({ user: createMockUser({ is_superuser: true }) });
      expect(screen.queryByTestId("dwh-upload-csv")).not.toBeInTheDocument();
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
    });
  });

  describe("add database button", () => {
    it("should render for admins if they haven't added a database yet", async () => {
      await setup({
        user: createMockUser({ is_superuser: true }),
        withAdditionalDatabase: false,
      });

      const sidebar = screen.getByTestId("main-navbar-root");
      expect(within(sidebar).getByText("Add database")).toBeInTheDocument();
      expect(within(sidebar).getByTestId("add-database-link")).toHaveAttribute(
        "href",
        "/admin/databases/create",
      );
    });

    it("should not render for admins if they previously added a database", async () => {
      await setup({
        user: createMockUser({ is_superuser: true }),
        withAdditionalDatabase: true,
      });

      const sidebar = screen.getByTestId("main-navbar-root");
      expect(
        within(sidebar).queryByText("Add database"),
      ).not.toBeInTheDocument();
    });

    it("should not render for regular users", async () => {
      await setup({
        user: createMockUser({ is_superuser: false }),
        withAdditionalDatabase: false,
      });

      const sidebar = screen.getByTestId("main-navbar-root");
      expect(
        within(sidebar).queryByText("Add database"),
      ).not.toBeInTheDocument();
    });
  });
});
