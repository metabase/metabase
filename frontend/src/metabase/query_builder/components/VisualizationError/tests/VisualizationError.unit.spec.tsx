import { getMetadata } from "metabase/selectors/metadata";
import type { Card, Database } from "metabase-types/api";
import { createMockCard, createMockDatabase } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";
import { createMockEntitiesState } from "__support__/store";
import { render, screen } from "__support__/ui";
import { VisualizationError } from "../VisualizationError";

interface SetupOpts {
  database?: Database;
  card?: Card;
}

const setup = ({
  database = createMockDatabase(),
  card = createMockCard(),
}: SetupOpts) => {
  const state = createMockState({
    entities: createMockEntitiesState({
      databases: [database],
      questions: [card],
    }),
  });

  const metadata = getMetadata(state);
  const question = metadata.question(card.id);

  render(
    <VisualizationError
      question={question}
      duration={0}
      error="An error occurred"
      via={{}}
    />,
  );
};

describe("VisualizationError", () => {
  it("should show a help link for sql databases", () => {
    const database = createMockDatabase({
      engine: "postgres",
    });
    const card = createMockCard({
      dataset_query: {
        database: database.id,
        type: "native",
        native: {
          query: "SELECT * FROM ORDERS",
        },
      },
    });
    setup({ database, card });

    expect(
      screen.getByText("Learn how to debug SQL errors"),
    ).toBeInTheDocument();
  });

  it("should not show a help link for a nosql databases", () => {
    const database = createMockDatabase({
      engine: "mongo",
    });
    const card = createMockCard({
      dataset_query: {
        database: database.id,
        type: "native",
        native: {
          query: "[]",
        },
      },
    });
    setup({ database, card });

    expect(
      screen.queryByText("Learn how to debug SQL errors"),
    ).not.toBeInTheDocument();
  });
});
