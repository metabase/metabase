import React from "react";
import userEvent from "@testing-library/user-event";

import {
  renderWithProviders,
  screen,
  fireEvent,
  getIcon,
} from "__support__/ui";
import {
  setupSearchEndpoints,
  setupRecentViewsEndpoints,
} from "__support__/server-mocks";

import type {
  DashboardOrderedCard,
  LinkCardSettings,
} from "metabase-types/api";
import {
  createMockDashboardCardWithVirtualCard,
  createMockCollectionItem,
  createMockCollection,
  createMockRecentItem,
  createMockTable,
  createMockDashboard,
} from "metabase-types/api/mocks";

import LinkViz, { LinkVizProps } from "./LinkViz";

type LinkCardVizSettings = DashboardOrderedCard["visualization_settings"] & {
  link: LinkCardSettings;
};

const linkDashcard = createMockDashboardCardWithVirtualCard({
  visualization_settings: {
    link: {
      url: "https://example23.com",
    },
    virtual_card: {
      display: "link",
    },
  },
});

const emptyLinkDashcard = createMockDashboardCardWithVirtualCard({
  visualization_settings: {
    link: {
      url: "",
    },
    virtual_card: {
      display: "link",
    },
  },
});

const questionLinkDashcard = createMockDashboardCardWithVirtualCard({
  visualization_settings: {
    link: {
      entity: {
        id: 1,
        name: "Question Uno",
        model: "card",
        display: "pie",
      },
    },
    virtual_card: {
      display: "link",
    },
  },
});

const restrictedLinkDashcard = createMockDashboardCardWithVirtualCard({
  visualization_settings: {
    link: {
      entity: {
        restricted: true,
      },
    },
    virtual_card: {
      display: "link",
    },
  },
});

const tableLinkDashcard = createMockDashboardCardWithVirtualCard({
  visualization_settings: {
    link: {
      entity: {
        id: 1,
        db_id: 20,
        name: "Table Uno",
        model: "table",
      },
    },
    virtual_card: {
      display: "link",
    },
  },
});

const searchingDashcard = createMockDashboardCardWithVirtualCard({
  visualization_settings: {
    link: {
      url: "question",
    },
    virtual_card: {
      display: "link",
    },
  },
});

const searchCardItem = createMockCollectionItem({
  id: 1,
  model: "card",
  name: "Question Uno",
  display: "pie",
  collection: createMockCollection(),
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

      expect(screen.getByRole("link")).toHaveAttribute("target", "_blank");
    });

    it("sets embedded entity links to not open in new tabs", () => {
      // here, we're mocking this appearing in an iframe by manipulating window.top !== window.self
      const topCache = window.top;
      // @ts-expect-error we need to delete this for it to actually update
      delete window.top;
      // @ts-expect-error it doesn't actually matter if this is valid
      window.top = {};

      setup({
        isEditing: false,
        dashcard: tableLinkDashcard,
        settings:
          tableLinkDashcard.visualization_settings as LinkCardVizSettings,
      });

      expect(screen.getByRole("link")).not.toHaveAttribute("target");
      // @ts-expect-error we need to delete this for it to actually update
      delete window.top;
      window.top = topCache;
    });

    it("clicking a search item should update the entity", async () => {
      setupSearchEndpoints([searchCardItem]);

      const { changeSpy } = setup({
        isEditing: true,
        dashcard: searchingDashcard,
        settings:
          searchingDashcard.visualization_settings as LinkCardVizSettings,
      });

      const searchInput = screen.getByPlaceholderText("https://example.com");

      userEvent.click(searchInput);
      // There's a race here: as soon the search input is clicked into the text
      // "Loading..." appears and is then replaced by "Question Uno". On CI,
      // `findByText` was sometimes running while "Loading..." was still
      // visible, so the extra expectation ensures good timing
      expect(await screen.findByText("Loading...")).toBeInTheDocument();
      userEvent.click(await screen.findByText("Question Uno"));

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
      const recentTableItem = createMockRecentItem({
        cnt: 20,
        user_id: 20,
        model: "table",
        model_id: 121,
        model_object: createMockTable({
          id: 121,
          name: "Table Uno",
          display_name: "Table Uno",
          db_id: 20,
        }),
      });

      const recentDashboardItem = createMockRecentItem({
        cnt: 20,
        user_id: 20,
        model: "dashboard",
        model_id: 131,
        model_object: createMockDashboard({
          id: 131,
          name: "Dashboard Uno",
        }),
      });

      setupRecentViewsEndpoints([recentTableItem, recentDashboardItem]);

      const { changeSpy } = setup({
        isEditing: true,
        dashcard: emptyLinkDashcard,
        settings:
          emptyLinkDashcard.visualization_settings as LinkCardVizSettings,
      });

      const searchInput = screen.getByPlaceholderText("https://example.com");

      userEvent.click(searchInput);

      await screen.findByText("Dashboard Uno");
      userEvent.click(await screen.findByText("Table Uno"));

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
