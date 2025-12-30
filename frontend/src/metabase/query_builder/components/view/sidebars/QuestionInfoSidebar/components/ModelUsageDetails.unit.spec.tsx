import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import { createMockMetadata } from "__support__/metadata";
import {
  setupCardQueryMetadataEndpoint,
  setupCardsEndpoints,
  setupCardsUsingModelEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import { TYPE } from "metabase-lib/v1/types/constants";
import * as ML_Urls from "metabase-lib/v1/urls";
import type { Card, Collection, Database, Settings } from "metabase-types/api";
import {
  createMockCardQueryMetadata,
  createMockDatabase,
  createMockField,
  createMockNativeDatasetQuery,
  createMockNativeQuery,
  createMockStructuredDatasetQuery,
  createMockStructuredQuery,
  createMockTable,
} from "metabase-types/api/mocks";
import {
  createNativeModelCard as _createNativeModelCard,
  createStructuredModelCard as _createStructuredModelCard,
  createSavedNativeCard,
  createSavedStructuredCard,
} from "metabase-types/api/mocks/presets";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { ModelUsageDetails } from "./ModelUsageDetails";
import { DEFAULT_LIST_LIMIT } from "./hooks";

const TEST_DATABASE_ID = 1;
const TEST_TABLE_ID = 1;
const TEST_FIELD = createMockField({
  id: 1,
  display_name: "Field 1",
  semantic_type: TYPE.PK,
  table_id: TEST_TABLE_ID,
});

const TEST_FK_TABLE_1_ID = 2;
const TEST_FK_FIELD_ID = 4;
const TEST_FK_FIELD = createMockField({
  id: TEST_FK_FIELD_ID,
  table_id: TEST_FK_TABLE_1_ID,
});

const TEST_FIELDS = [
  TEST_FIELD,
  createMockField({
    id: 2,
    display_name: "Field 2",
    table_id: TEST_TABLE_ID,
  }),
  createMockField({
    id: 3,
    display_name: "Field 3",
    table_id: TEST_TABLE_ID,
    semantic_type: TYPE.FK,
    fk_target_field_id: TEST_FK_FIELD_ID,
    target: TEST_FK_FIELD,
  }),
];

const TEST_TABLE = createMockTable({
  id: TEST_TABLE_ID,
  name: "TEST_TABLE",
  display_name: "TEST_TABLE",
  fields: TEST_FIELDS,
  db_id: TEST_DATABASE_ID,
});

const TEST_FK_TABLE_1 = createMockTable({
  id: TEST_FK_TABLE_1_ID,
  name: "TEST_TABLE points to this",
  fields: [TEST_FK_FIELD],
});

const TEST_DATABASE = createMockDatabase({
  id: TEST_DATABASE_ID,
  name: "Test Database",
  tables: [TEST_TABLE, TEST_FK_TABLE_1],
});

function createStructuredModelCard(card?: Partial<Card>) {
  return _createStructuredModelCard({
    can_write: true,
    ...card,
    result_metadata: TEST_FIELDS,
    dataset_query: createMockStructuredDatasetQuery({
      database: TEST_DATABASE_ID,
      query: createMockStructuredQuery({ "source-table": TEST_TABLE_ID }),
    }),
  });
}

function createNativeModelCard(card?: Partial<Card>) {
  return _createNativeModelCard({
    can_write: true,
    ...card,
    result_metadata: TEST_FIELDS,
    dataset_query: createMockNativeDatasetQuery({
      database: TEST_DATABASE_ID,
      native: createMockNativeQuery({
        query: `SELECT * FROM ${TEST_TABLE.name}`,
      }),
    }),
  });
}

type SetupOpts = {
  model: Card;
  databases?: Database[];
  collections?: Collection[];
  usedBy?: Card[];
  settings?: Partial<Settings>;
};

async function setup({
  model: card,
  databases = [TEST_DATABASE],
  collections = [],
  usedBy = [],
  settings = {},
}: SetupOpts) {
  const storeInitialState = createMockState({
    settings: createMockSettingsState(settings),
  });
  const metadata = createMockMetadata({
    databases: databases,
    tables: [TEST_TABLE, TEST_FK_TABLE_1],
    fields: TEST_FIELDS,
    questions: [card, ...usedBy],
  });

  const model = checkNotNull(metadata.question(card.id));
  const usedByQuestions = usedBy.map((q) =>
    checkNotNull(metadata.question(q.id)),
  );

  setupDatabasesEndpoints(databases);
  setupCardsUsingModelEndpoint(card, usedBy);
  setupCardsEndpoints([card]);
  setupCardQueryMetadataEndpoint(
    card,
    createMockCardQueryMetadata({
      databases,
      tables: [
        createMockTable({
          id: `card__${card.id}`,
          name: card.name,
          fields: card.result_metadata ?? [],
        }),
      ],
    }),
  );
  setupCollectionsEndpoints({ collections });

  const { history } = renderWithProviders(
    <Route path="*" component={() => <ModelUsageDetails model={model} />} />,
    {
      withRouter: true,
      storeInitialState,
    },
  );
  await waitForLoaderToBeRemoved();

  return { model, history, metadata, usedByQuestions };
}

describe("ModelUsageDetails", () => {
  describe.each([
    { type: "structured", getModel: createStructuredModelCard },
    { type: "native", getModel: createNativeModelCard },
  ])(`$type model`, ({ getModel }) => {
    describe("used by section", () => {
      it("has an empty state", async () => {
        await setup({ model: getModel() });

        expect(
          await screen.findByText(
            /This model is not used by any questions yet/i,
          ),
        ).toBeInTheDocument();
      });

      it("lists questions used by the model", async () => {
        const { usedByQuestions } = await setup({
          model: getModel({ name: "My Model" }),
          usedBy: [
            createSavedStructuredCard({ id: 5, name: "Q1" }),
            createSavedNativeCard({ id: 6, name: "Q2" }),
          ],
        });

        for (const q of usedByQuestions) {
          const link = await screen.findByLabelText(q._card.name);
          expect(link).toBeInTheDocument();
          expect(link).toHaveAttribute("href", ML_Urls.getUrl(q));
        }

        expect(
          screen.queryByText(/This model is not used by any questions yet/i),
        ).not.toBeInTheDocument();
      });

      it("toggles the list of questions used by the model", async () => {
        const { usedByQuestions } = await setup({
          model: getModel({ name: "My Model" }),
          usedBy: [
            createSavedNativeCard({ id: 5, name: "Q1" }),
            createSavedNativeCard({ id: 6, name: "Q2" }),
            createSavedNativeCard({ id: 7, name: "Q3" }),
            createSavedNativeCard({ id: 8, name: "Q4" }),
            createSavedNativeCard({ id: 9, name: "Q5" }),
            createSavedNativeCard({ id: 10, name: "Q6" }),
          ],
        });

        const slicedQuestions = usedByQuestions.slice(0, DEFAULT_LIST_LIMIT);

        for (const q of slicedQuestions) {
          const link = await screen.findByLabelText(q._card.name);
          expect(link).toBeInTheDocument();
          expect(link).toHaveAttribute("href", ML_Urls.getUrl(q));
        }

        // Expect sixth card to be hidden
        expect(screen.queryByLabelText("Q6")).not.toBeInTheDocument();

        await userEvent.click(
          screen.getByRole("button", { name: /Show all/i }),
        );

        // Expect the sixth card now to be shown
        expect(await screen.findByLabelText("Q6")).toBeVisible();
      });
    });
  });
});
