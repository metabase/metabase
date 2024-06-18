import { screen, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import _ from "underscore";

import type { Card, GetCompatibleCardsPayload } from "metabase-types/api";
import {
  createMockCard,
  createMockDashboardCard,
} from "metabase-types/api/mocks";

import { QuestionList } from "./QuestionList";

const compatibleCardsFirstPage = _.range(50).map(index =>
  createMockCard({ id: index, name: `compatible card ${index} page 1` }),
);

const compatibleCardsSecondPage = _.range(10).map(index => {
  const id = index + 50;
  return createMockCard({
    id,
    name: `compatible card ${id} page 2`,
  });
});

const mockCompatibleCardsPage = (
  cards: Card[],
  query: Partial<GetCompatibleCardsPayload> = {},
) => {
  fetchMock.getOnce(
    {
      url: "path:/api/card/1/series",
      overwriteRoutes: true,
      query: {
        limit: 50,
        ...query,
      },
    },
    cards,
  );
};

describe("QuestionList", () => {
  afterEach(() => {
    fetchMock.reset();
  });

  it("should paginate compatible cards", async () => {
    mockCompatibleCardsPage(compatibleCardsFirstPage);

    const onSelect = jest.fn();
    const dashcard = createMockDashboardCard({ card_id: 1 });

    render(
      <QuestionList
        enabledCards={[]}
        dashcard={dashcard}
        onSelect={onSelect}
      />,
    );

    expect(
      await screen.findByText("compatible card 1 page 1"),
    ).toBeInTheDocument();

    mockCompatibleCardsPage(compatibleCardsSecondPage, {
      last_cursor: _.last(compatibleCardsFirstPage)?.id,
    });

    await userEvent.click(
      await screen.findByRole("button", {
        name: /load more/i,
      }),
    );

    const secondPageItem = await screen.findByText("compatible card 50 page 2");

    await userEvent.click(secondPageItem);
    expect(onSelect).toHaveBeenCalledWith(compatibleCardsSecondPage[0], true);
  });

  it("should allow searching cards by name", async () => {
    mockCompatibleCardsPage(compatibleCardsFirstPage);

    const onSelect = jest.fn();
    const dashcard = createMockDashboardCard({ card_id: 1 });
    const selectedCard = createMockCard({
      id: 500,
      name: "search text selected card",
    });
    render(
      <QuestionList
        enabledCards={[selectedCard]}
        dashcard={dashcard}
        onSelect={onSelect}
      />,
    );

    expect(
      await screen.findByText("compatible card 1 page 1"),
    ).toBeInTheDocument();

    mockCompatibleCardsPage(
      [selectedCard, createMockCard({ id: 1000, name: "search text card" })],
      {
        query: "search text",
      },
    );

    await userEvent.type(
      screen.getByPlaceholderText("Search for a question"),
      "search text",
    );

    expect(await screen.findByText("search text card")).toBeInTheDocument();
    expect(
      await screen.findByText("search text selected card"),
    ).toBeInTheDocument();
  });

  it("should show added cards checked and allow selecting new ones", async () => {
    mockCompatibleCardsPage([createMockCard({ id: 3, name: "fetched card" })]);

    const cards = [createMockCard({ id: 2, name: "added card" })];
    const dashcard = createMockDashboardCard({ card_id: 1 });

    render(
      <QuestionList
        enabledCards={cards}
        dashcard={dashcard}
        onSelect={jest.fn()}
      />,
    );

    expect(
      await screen.findByRole("checkbox", {
        name: /added card/i,
      }),
    ).toBeChecked();

    expect(
      await screen.findByRole("checkbox", {
        name: /fetched card/i,
      }),
    ).not.toBeChecked();
  });
});
