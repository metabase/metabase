import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import { getMetadata } from "metabase/selectors/metadata";
import type { Card } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import QuestionCacheSection from "./QuestionCacheSection";

interface SetupOpts {
  card?: Card;
}

const setup = ({ card = createMockCard() }: SetupOpts) => {
  const state = createMockState({
    entities: createMockEntitiesState({
      questions: [card],
    }),
  });
  const metadata = getMetadata(state);
  const question = checkNotNull(metadata.question(card.id));

  renderWithProviders(
    <QuestionCacheSection question={question} onSave={jest.fn()} />,
    { storeInitialState: state },
  );
};

describe("QuestionCacheSection", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2020, 0, 10));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should show the time of the last cached query if the question is cached", () => {
    setup({
      card: createMockCard({
        can_write: false,
        last_query_start: "2020-01-05T00:00:00Z",
      }),
    });

    expect(
      screen.getByText("Question last cached 5 days ago"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Cache Configuration")).not.toBeInTheDocument();
  });

  it("should not show the last cached query time if the question is not cached", () => {
    setup({
      card: createMockCard({
        can_write: true,
        last_query_start: null,
      }),
    });

    expect(screen.getByText("Cache Configuration")).toBeInTheDocument();
    expect(screen.queryByText(/Question last cached/)).not.toBeInTheDocument();
  });
});
