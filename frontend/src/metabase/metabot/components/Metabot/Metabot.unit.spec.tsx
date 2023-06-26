import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { checkNotNull } from "metabase/core/utils/types";
import { getMetadata } from "metabase/selectors/metadata";
import { Card, Database } from "metabase-types/api";
import {
  createMockCard,
  createMockDatabase,
  createMockField,
  createMockTable,
} from "metabase-types/api/mocks";
import { createStructuredModelCard } from "metabase-types/api/mocks/presets";
import { MetabotEntityId, MetabotEntityType } from "metabase-types/store";
import { createMockState } from "metabase-types/store/mocks";
import {
  setupCardDataset,
  setupDatabaseEndpoints,
} from "__support__/server-mocks";
import {
  API_ERROR,
  setupBadRequestMetabotDatabaseEndpoint,
  setupBadRequestMetabotModelEndpoint,
  setupMetabotDatabaseEndpoint,
  setupMetabotModelEndpoint,
} from "__support__/server-mocks/metabot";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import Metabot from "./Metabot";

const PROMPT = "average orders total";

const ORDERS_DATABASE_ID = 1;
const ORDERS_TABLE_ID = 1;

const FIELD = createMockField({
  id: 1,
  table_id: ORDERS_TABLE_ID,
});

const ORDERS_TABLE = createMockTable({
  id: ORDERS_TABLE_ID,
  name: "ORDERS",
  display_name: "Orders",
  fields: [FIELD],
  db_id: ORDERS_DATABASE_ID,
});

const ORDERS_DATABASE = createMockDatabase({
  id: ORDERS_DATABASE_ID,
  name: "Test Database",
  tables: [ORDERS_TABLE],
});

const MODEL = createStructuredModelCard({
  id: 1,
  name: "Q1",
  result_metadata: [FIELD],
  dataset_query: {
    database: ORDERS_DATABASE_ID,
    type: "query",
    query: { "source-table": ORDERS_TABLE_ID },
  },
});

const GENERATED_CARD = createMockCard({ id: undefined, display: "table" });
const RESULT_VALUE = "result value";

const setupMetabotDatabaseEndpoints = (couldGenerateCard = true) => {
  setupDatabaseEndpoints(ORDERS_DATABASE);

  if (couldGenerateCard) {
    setupMetabotDatabaseEndpoint(ORDERS_DATABASE.id, GENERATED_CARD);

    setupCardDataset({
      row_count: 1,
      data: { rows: [[RESULT_VALUE]] },
    });
  } else {
    setupBadRequestMetabotDatabaseEndpoint(ORDERS_DATABASE.id);
  }
};

const setupMetabotModelEndpoints = (couldGenerateCard = true) => {
  if (couldGenerateCard) {
    setupMetabotModelEndpoint(MODEL.id, GENERATED_CARD, true);
    setupCardDataset(
      {
        row_count: 1,
        data: { rows: [[RESULT_VALUE]] },
      },
      true,
    );
  } else {
    setupBadRequestMetabotModelEndpoint(MODEL.id);
  }
};

interface SetupOpts {
  entityId?: MetabotEntityId;
  entityType: MetabotEntityType;
  initialPrompt?: string;
  model?: Card;
  database?: Database;
  databases?: Database[];
}

const setup = ({
  entityId = 1,
  entityType,
  initialPrompt,
  model,
  database = ORDERS_DATABASE,
  databases = [ORDERS_DATABASE],
}: SetupOpts) => {
  const state = createMockState({
    entities: createMockEntitiesState({
      databases: databases,
      questions: model ? [model] : [],
    }),
  });

  const metadata = getMetadata(state);

  renderWithProviders(
    <Metabot
      entityId={entityId}
      entityType={entityType}
      initialPrompt={initialPrompt}
      model={model ? checkNotNull(metadata.question(model.id)) : undefined}
      database={checkNotNull(metadata.database(database.id))}
      databases={[checkNotNull(metadata.database(database.id))]}
    />,
  );
};

describe("Metabot", () => {
  describe("database", () => {
    it("should show results for a given prompt", async () => {
      setupMetabotDatabaseEndpoints();
      setup({ entityType: "database" });

      enterPromptAndGetResults("Ask something…");

      expect(await screen.findByText("Here you go!")).toBeInTheDocument();
      expect(await screen.findByText(RESULT_VALUE)).toBeInTheDocument();
      expect(screen.getByText("How did I do?")).toBeInTheDocument();
    });

    it("should show an error when a query could not be generates", async () => {
      setupMetabotDatabaseEndpoints(false);
      setup({ entityType: "database" });

      enterPromptAndGetResults("Ask something…");

      expect(await screen.findByText(API_ERROR)).toBeInTheDocument();
      expect(screen.queryByText("How did I do?")).not.toBeInTheDocument();
    });
  });

  describe("model", () => {
    it("should show results for a given prompt", async () => {
      setupMetabotModelEndpoints();
      setup({ entityType: "model", model: MODEL });

      enterPromptAndGetResults(
        "Ask something like, how many Q1 have we had over time?",
      );
      expect(await screen.findByText("Here you go!")).toBeInTheDocument();
      expect(await screen.findByText(RESULT_VALUE)).toBeInTheDocument();
      expect(screen.getByText("How did I do?")).toBeInTheDocument();
    });

    it("should show an error when a query could not be generated", async () => {
      setupMetabotModelEndpoints(false);
      setup({ entityType: "model", model: MODEL });

      enterPromptAndGetResults(
        "Ask something like, how many Q1 have we had over time?",
      );
      expect(await screen.findByText(API_ERROR)).toBeInTheDocument();
      expect(screen.queryByText("How did I do?")).not.toBeInTheDocument();

      // The error state get cleared
      setupMetabotModelEndpoints(true);

      userEvent.click(screen.getByRole("button", { name: /get answer/i }));
      expect(await screen.findByText("Here you go!")).toBeInTheDocument();
      expect(await screen.findByText(RESULT_VALUE)).toBeInTheDocument();
    });
  });

  it("allows to send feedback", async () => {
    fetchMock.post("path:/api/metabot/feedback", {});

    const entityType = "model";

    setupMetabotModelEndpoints();
    setup({ entityType, model: MODEL });

    enterPromptAndGetResults(
      "Ask something like, how many Q1 have we had over time?",
    );

    expect(await screen.findByText("How did I do?")).toBeInTheDocument();

    userEvent.click(screen.getByText("This is great!"));

    expect(await screen.findByText("Glad to hear it!")).toBeInTheDocument();
  });
});

function enterPromptAndGetResults(inputPlaceholder: string) {
  // Empty state
  screen.getByRole("img", { name: /insight icon/i });

  userEvent.type(screen.getByPlaceholderText(inputPlaceholder), PROMPT);
  userEvent.click(screen.getByRole("button", { name: /get answer/i }));

  expect(screen.getByText("Doing science...")).toBeInTheDocument();
}
