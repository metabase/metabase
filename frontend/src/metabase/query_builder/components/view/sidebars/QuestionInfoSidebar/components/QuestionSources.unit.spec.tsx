import _ from "underscore";

import { createMockMetadata } from "__support__/metadata";
import { setupListDatabaseSchemasEndpoint } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import {
  createMockQueryBuilderState,
  createMockState,
} from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, within } from "__support__/ui";
import { modelIconMap } from "metabase/common/utils/icon";
import { Route } from "metabase/router";
import * as Lib from "metabase-lib";
import {
  SAMPLE_PROVIDER,
  createMetadataProvider,
} from "metabase-lib/test-helpers";
import type { Card } from "metabase-types/api";
import { createMockCard, createMockSettings } from "metabase-types/api/mocks";
import {
  PRODUCTS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { QuestionSources } from "./QuestionSources";

const PRODUCTS_QUERY = Lib.createTestJsQuery(SAMPLE_PROVIDER, {
  stages: [{ source: { type: "table", id: PRODUCTS_ID } }],
});

interface SetupOpts {
  card?: Card;
  sourceCard?: Card;
}

const setup = async ({
  card = createMockCard(),
  sourceCard,
}: SetupOpts = {}) => {
  const database = createSampleDatabase();

  const state = createMockState({
    qb: createMockQueryBuilderState({ card }),
    settings: mockSettings(createMockSettings()),
    entities: createMockEntitiesState({
      databases: [database],
      questions: _.compact([card, sourceCard]),
    }),
  });

  setupListDatabaseSchemasEndpoint(SAMPLE_DB_ID, ["PUBLIC"]);

  return renderWithProviders(<Route path="/" element={<QuestionSources />} />, {
    withRouter: true,
    storeInitialState: state,
  });
};

describe("QuestionSources", () => {
  it("should show table source information", async () => {
    const card = createMockCard({
      name: "Question",
      dataset_query: PRODUCTS_QUERY,
    });
    await setup({ card });
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
    const sourceCard = createMockCard({
      name: "My Source Question",
      id: 2,
    });

    const card = createMockCard({
      name: "My Question",
      dataset_query: Lib.toJsQuery(
        Lib.createTestQuery(
          createMetadataProvider({
            metadata: createMockMetadata({
              databases: [createSampleDatabase()],
              questions: [sourceCard],
            }),
          }),
          { stages: [{ source: { type: "card", id: sourceCard.id } }] },
        ),
      ),
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
      dataset_query: PRODUCTS_QUERY,
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
