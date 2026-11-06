import userEvent from "@testing-library/user-event";

import {
  setupCardEndpoints,
  setupCollectionByIdEndpoint,
  setupTableQueryMetadataEndpoint,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { Card, Field } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockField,
  createMockTable,
} from "metabase-types/api/mocks";
import {
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import type { DataReferenceItem } from "../types";

import { QuestionPane } from "./QuestionPane";

const CARD_ID = 1;

interface SetupOpts {
  card: Card;
  fields: Field[];
}

const setup = async ({ card, fields }: SetupOpts) => {
  const onItemClick = jest.fn<void, [DataReferenceItem]>();
  setupCardEndpoints(card);
  setupCollectionByIdEndpoint({
    collections: [createMockCollection({ id: "root", name: "Our analytics" })],
  });
  setupTableQueryMetadataEndpoint(
    createMockTable({
      id: getQuestionVirtualTableId(card.id),
      db_id: SAMPLE_DB_ID,
      display_name: card.name,
      fields,
    }),
  );

  renderWithProviders(
    <QuestionPane
      type="question"
      id={card.id}
      onItemClick={onItemClick}
      onBack={jest.fn()}
      onClose={jest.fn()}
    />,
    {
      storeInitialState: createMockState({
        entities: createMockEntitiesState({
          databases: [createSampleDatabase()],
        }),
      }),
    },
  );
  await waitForLoaderToBeRemoved();

  return { onItemClick };
};

describe("QuestionPane", () => {
  it("should list columns of question with aggregation (metabase#86298)", async () => {
    const card = createMockCard({ id: CARD_ID, name: "Orders count" });
    const { onItemClick } = await setup({
      card,
      fields: [
        createMockField({
          id: ["field", "count", { "base-type": "type/BigInteger" }],
          table_id: getQuestionVirtualTableId(CARD_ID),
          name: "count",
          display_name: "Count",
          base_type: "type/BigInteger",
          effective_type: "type/BigInteger",
          semantic_type: "type/Quantity",
          field_ref: ["aggregation", 0],
        }),
      ],
    });

    expect(screen.getByText("1 column")).toBeInTheDocument();
    expect(screen.getByLabelText("More info")).toBeInTheDocument();

    await userEvent.click(screen.getByText("count"));
    expect(onItemClick).toHaveBeenCalledWith({
      type: "field",
      tableId: getQuestionVirtualTableId(CARD_ID),
      columnIndex: 0,
    });
  });
});
