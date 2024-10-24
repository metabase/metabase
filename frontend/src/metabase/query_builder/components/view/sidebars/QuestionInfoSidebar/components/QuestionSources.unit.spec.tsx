import { Route } from "react-router";
import _ from "underscore";

import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, within } from "__support__/ui";
import { modelIconMap } from "metabase/lib/icon";
import { convertSavedQuestionToVirtualTable } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { Card, NormalizedTable } from "metabase-types/api";
import { createMockCard, createMockSettings } from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import {
  createMockQueryBuilderState,
  createMockState,
} from "metabase-types/store/mocks";

import { QuestionSources } from "./QuestionSources";

interface SetupOpts {
  card?: Card;
  sourceCard?: Card;
}

const setup = async ({
  card = createMockCard(),
  sourceCard,
}: SetupOpts = {}) => {
  const state = createMockState({
    qb: createMockQueryBuilderState({ card }),
    settings: mockSettings(createMockSettings()),
    entities: createMockEntitiesState({
      databases: [createSampleDatabase()],
      questions: _.compact([card, sourceCard]),
    }),
  });

  // 😫 all this is necessary to test a card as a question source
  if (sourceCard) {
    const virtualTable = convertSavedQuestionToVirtualTable(sourceCard);

    state.entities = {
      ...state.entities,
      tables: {
        ...(state.entities.tables as Record<number, NormalizedTable>),
        [virtualTable.id]: virtualTable,
      },
      databases: {
        [state.entities.databases[1].id]: {
          ...state.entities.databases[1],
          tables: [
            ...(state.entities.databases[1].tables ?? []),
            virtualTable.id,
          ],
        },
      },
    };
  }

  return renderWithProviders(
    <Route path="/" component={() => <QuestionSources />} />,
    {
      withRouter: true,
      storeInitialState: state,
    },
  );
};

describe("QuestionSources", () => {
  it("should show table source information", async () => {
    const card = createMockCard({
      name: "Question",
    });
    setup({ card });
    const databaseLink = await screen.findByRole("link", {
      name: /Sample Database/i,
    });
    expect(
      await within(databaseLink).findByLabelText("database icon"),
    ).toBeInTheDocument();
    expect(databaseLink).toHaveAttribute(
      "href",
      "/browse/databases/1-sample-database",
    );
    expect(screen.getByText("/")).toBeInTheDocument();
    const tableLink = await screen.findByRole("link", { name: /Products/i });
    expect(tableLink).toBeInTheDocument();
    expect(
      await within(tableLink).findByLabelText(`table icon`),
    ).toBeInTheDocument();
    expect(tableLink).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/question#[a-zA-Z0-9]{20}/),
    );
  });

  it("should show card source information", async () => {
    const card = createMockCard({
      name: "My Question",
      dataset_query: {
        type: "query",
        database: 1,
        query: {
          "source-table": "card__2",
        },
      },
    });

    const sourceCard = createMockCard({
      name: "My Source Question",
      id: 2,
    });

    await setup({ card, sourceCard });

    const databaseLink = await screen.findByRole("link", {
      name: /Sample Database/i,
    });

    expect(
      await within(databaseLink).findByLabelText("database icon"),
    ).toBeInTheDocument();
    expect(databaseLink).toHaveAttribute(
      "href",
      "/browse/databases/1-sample-database",
    );

    expect(screen.getByText("/")).toBeInTheDocument();

    const questionLink = await screen.findByRole("link", {
      name: /My Source Question/i,
    });
    expect(
      await within(questionLink).findByLabelText(
        `${modelIconMap["card"]} icon`,
      ),
    ).toBeInTheDocument();
    expect(questionLink).toHaveAttribute(
      "href",
      "/question/2-my-source-question",
    );
  });

  it("shows source information for a model (its database and table)", async () => {
    const model = createMockCard({
      name: "My Model",
      type: "model",
    });

    await setup({ card: model });

    const databaseLink = await screen.findByRole("link", {
      name: /Sample Database/i,
    });

    expect(
      await within(databaseLink).findByLabelText("database icon"),
    ).toBeInTheDocument();
    expect(databaseLink).toHaveAttribute(
      "href",
      "/browse/databases/1-sample-database",
    );

    expect(screen.getByText("/")).toBeInTheDocument();

    const tableLink = await screen.findByRole("link", { name: /Products/i });
    expect(tableLink).toBeInTheDocument();
    expect(
      await within(tableLink).findByLabelText(`table icon`),
    ).toBeInTheDocument();
    expect(tableLink).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/question#[a-zA-Z0-9]{20}/),
    );
  });
});
