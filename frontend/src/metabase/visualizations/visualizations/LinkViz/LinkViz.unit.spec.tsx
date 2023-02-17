import React from "react";
import nock from "nock";
import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, fireEvent } from "__support__/ui";
import { setupSearchEndpoints } from "__support__/server-mocks";

import type {
  DashboardOrderedCard,
  LinkCardSettings,
} from "metabase-types/api";
import {
  createMockDashboardCardWithVirtualCard,
  createMockCard,
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

const searchCardItem = {
  model: "card",
  collection: {},
  ...createMockCard({
    name: "Question Uno",
    id: 1,
    display: "pie",
  }),
};

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

    it("should be able to search for questions", async () => {
      const scope = nock(location.origin);
      setupSearchEndpoints(scope, [searchCardItem]);

      setup({
        isEditing: true,
        dashcard: searchingDashcard,
        settings:
          searchingDashcard.visualization_settings as LinkCardVizSettings,
      });

      const searchInput = screen.getByPlaceholderText("https://example.com");

      userEvent.click(searchInput);

      expect(await screen.findByLabelText("pie icon")).toBeInTheDocument();
      expect(await screen.findByText("Question Uno")).toBeInTheDocument();
    });

    it("clicking a search item should update the entity", async () => {
      const scope = nock(location.origin);
      setupSearchEndpoints(scope, [searchCardItem]);

      const { changeSpy } = setup({
        isEditing: true,
        dashcard: searchingDashcard,
        settings:
          searchingDashcard.visualization_settings as LinkCardVizSettings,
      });

      const searchInput = screen.getByPlaceholderText("https://example.com");

      userEvent.click(searchInput);
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
  });
});
