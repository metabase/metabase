import userEvent from "@testing-library/user-event";

import {
  setupSearchEndpoints,
  setupRecentViewsEndpoints,
  setupCollectionByIdEndpoint,
  setupUserRecipientsEndpoint,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  fireEvent,
  getIcon,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import * as domUtils from "metabase/lib/dom";
import registerVisualizations from "metabase/visualizations/register";
import type {
  VirtualDashboardCard,
  LinkCardSettings,
} from "metabase-types/api";
import {
  createMockCollectionItem,
  createMockCollection,
  createMockRecentTableItem,
  createMockRecentCollectionItem,
  createMockUser,
  createMockLinkDashboardCard,
} from "metabase-types/api/mocks";

import type { LinkVizProps } from "./LinkViz";
import { LinkViz } from "./LinkViz";

registerVisualizations();

type LinkCardVizSettings = VirtualDashboardCard["visualization_settings"] & {
  link: LinkCardSettings;
};

const linkDashcard = createMockLinkDashboardCard({
  url: "https://example23.com",
});

const emptyLinkDashcard = createMockLinkDashboardCard({ url: "" });

const questionLinkDashcard = createMockLinkDashboardCard({
  visualization_settings: {
    link: {
      entity: {
        id: 1,
        name: "Question Uno",
        model: "card",
        display: "pie",
      },
    },
  },
});

const restrictedLinkDashcard = createMockLinkDashboardCard({
  visualization_settings: {
    link: {
      entity: {
        restricted: true,
      },
    },
  },
});

const tableLinkDashcard = createMockLinkDashboardCard({
  visualization_settings: {
    link: {
      entity: {
        id: 1,
        db_id: 20,
        name: "Table Uno",
        model: "table",
      },
    },
  },
});

const searchingDashcard = createMockLinkDashboardCard({ url: "question" });

const searchCardCollection = createMockCollection();
const searchCardItem = createMockCollectionItem({
  id: 1,
  model: "card",
  name: "Question Uno",
  display: "pie",
  collection: searchCardCollection,
});

const setup = (options?: Partial<LinkVizProps>) => {
  const changeSpy = jest.fn();

  renderWithProviders(
    <LinkViz
      dashcard={linkDashcard}
      isEditing={true}
      onUpdateVisualizationSettings={changeSpy}
      settings={linkDashcard.visualization_settings as LinkCardVizSettings}
      {...options}
    />,
  );

  return { changeSpy };
};

describe("LinkViz", () => {
  describe("url links", () => {
    it("should render link input settings view", () => {
      setup({ isEditing: true });

      expect(screen.getByPlaceholderText("https://example.com")).toHaveValue(
        "https://example23.com",
      );
    });

    it("updates visualization settings with input value", () => {
      const { changeSpy } = setup({ isEditing: true });

      const linkInput = screen.getByPlaceholderText("https://example.com");
      fireEvent.change(linkInput, {
        target: { value: "https://example.com/123" },
      });

      expect(changeSpy).toHaveBeenCalledWith({
        link: {
          url: "https://example.com/123",
        },
      });
    });

    it("should render link display view", () => {
      setup({ isEditing: false });

      expect(screen.getByLabelText("link icon")).toBeInTheDocument();
      expect(screen.getByText("https://example23.com")).toBeInTheDocument();
    });

    it("should render empty state", () => {
      setup({
        isEditing: false,
        dashcard: emptyLinkDashcard,
        settings:
          emptyLinkDashcard.visualization_settings as LinkCardVizSettings,
      });

      expect(screen.queryByLabelText("link icon")).not.toBeInTheDocument();
      expect(screen.getByLabelText("question icon")).toBeInTheDocument();

      expect(screen.getByText("Choose a link")).toBeInTheDocument();
    });

    it("should have a link that loads the URL in a new page", () => {
      setup({ isEditing: false });

      expect(screen.getByText("https://example23.com")).toBeInTheDocument();
      expect(screen.getByRole("link")).toHaveAttribute("target", "_blank");
    });

    it("should open absolute links to question in the same tab", () => {
      const dashcard = createMockLinkDashboardCard({
        url: "http://localhost/question/1-example",
      });

      setup({
        isEditing: false,
        dashcard,
        settings: dashcard.visualization_settings as LinkCardVizSettings,
      });

      expect(window.location.origin).toBe("http://localhost");

      expect(
        screen.getByText("http://localhost/question/1-example"),
      ).toBeInTheDocument();

      expect(screen.getByRole("link")).toHaveAttribute("target", "_self");
    });

    it("should open relative links to question in the same tab", () => {
      const dashcard = createMockLinkDashboardCard({
        url: "question/2-example",
      });

      setup({
        isEditing: false,
        dashcard,
        settings: dashcard.visualization_settings as LinkCardVizSettings,
      });

      expect(screen.getByText("question/2-example")).toBeInTheDocument();
      expect(screen.getByRole("link")).toHaveAttribute("target", "_self");
    });
  });

  describe("entity links", () => {
    it("shows a link to a pie chart question", () => {
      setup({
        isEditing: false,
        dashcard: questionLinkDashcard,
        settings:
          questionLinkDashcard.visualization_settings as LinkCardVizSettings,
      });

      expect(screen.getByLabelText("pie icon")).toBeInTheDocument();
      expect(screen.getByText("Question Uno")).toBeInTheDocument();
    });

    it("shows a link to a table", () => {
      setup({
        isEditing: false,
        dashcard: tableLinkDashcard,
        settings:
          tableLinkDashcard.visualization_settings as LinkCardVizSettings,
      });

      expect(screen.getByLabelText("database icon")).toBeInTheDocument();
      expect(screen.getByText("Table Uno")).toBeInTheDocument();
    });

    it("sets embedded links to open in new tabs", () => {
      setup({
        isEditing: false,
        dashcard: tableLinkDashcard,
        settings:
          tableLinkDashcard.visualization_settings as LinkCardVizSettings,
      });

      expect(screen.getByRole("link")).not.toHaveAttribute("target");
    });

    it("sets embedded entity links to not open in new tabs", () => {
      // here, we're mocking this appearing in an iframe
      jest.spyOn(domUtils, "isWithinIframe").mockReturnValue(true);

      setup({
        isEditing: false,
        dashcard: tableLinkDashcard,
        settings:
          tableLinkDashcard.visualization_settings as LinkCardVizSettings,
      });

      expect(screen.getByRole("link")).not.toHaveAttribute("target");
    });

    it("clicking a search item should update the entity", async () => {
      setupSearchEndpoints([searchCardItem]);
      setupUserRecipientsEndpoint({ users: [createMockUser()] });
      setupCollectionByIdEndpoint({
        collections: [searchCardCollection],
      });

      const { changeSpy } = setup({
        isEditing: true,
        dashcard: searchingDashcard,
        settings:
          searchingDashcard.visualization_settings as LinkCardVizSettings,
      });

      const searchInput = screen.getByPlaceholderText("https://example.com");

      await userEvent.click(searchInput);
      // There's a race here: as soon the search input is clicked into the text
      // "Loading..." appears and is then replaced by "Question Uno". On CI,
      // `findByText` was sometimes running while "Loading..." was still
      // visible, so the extra expectation ensures good timing
      await waitForLoaderToBeRemoved();

      await userEvent.click(await screen.findByText("Question Uno"));

      expect(changeSpy).toHaveBeenCalledWith({
        link: {
          entity: expect.objectContaining({
            id: 1,
            name: "Question Uno",
            model: "card",
            display: "pie",
          }),
        },
      });
    });

    it("clicking a recent item should update the entity", async () => {
      const recentTableItem = createMockRecentTableItem({
        model: "table",
        id: 121,
        name: "Table Uno",
        display_name: "Table Uno",
        database: {
          id: 20,
          name: "Database Uno",
          initial_sync_status: "complete",
        },
      });

      const recentDashboardItem = createMockRecentCollectionItem({
        id: 131,
        name: "Dashboard Uno",
        model: "dashboard",
        parent_collection: {
          id: 1,
          name: "Collection Uno",
        },
      });

      setupRecentViewsEndpoints([recentTableItem, recentDashboardItem]);

      const { changeSpy } = setup({
        isEditing: true,
        dashcard: emptyLinkDashcard,
        settings:
          emptyLinkDashcard.visualization_settings as LinkCardVizSettings,
      });

      const searchInput = screen.getByPlaceholderText("https://example.com");

      await userEvent.click(searchInput);

      await screen.findByText("Dashboard Uno");
      await userEvent.click(await screen.findByText("Table Uno"));

      expect(changeSpy).toHaveBeenCalledWith({
        link: {
          entity: expect.objectContaining({
            id: 121,
            name: "Table Uno",
            model: "table",
          }),
        },
      });
    });

    it("shows a notice if the user doesn't have permissions to the entity", () => {
      setup({
        isEditing: false,
        dashcard: restrictedLinkDashcard,
        settings:
          restrictedLinkDashcard.visualization_settings as LinkCardVizSettings,
      });

      expect(getIcon("key")).toBeInTheDocument();
      expect(screen.getByText(/don't have permission/i)).toBeInTheDocument();
    });
  });
});
