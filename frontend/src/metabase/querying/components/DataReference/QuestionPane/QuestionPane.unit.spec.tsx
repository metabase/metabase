import userEvent from "@testing-library/user-event";

import {
  setupCardEndpoints,
  setupCardQueryMetadataEndpoint,
  setupCollectionByIdEndpoint,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import type { Card } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockField,
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
}

const setup = async ({ card }: SetupOpts) => {
  const onItemClick = jest.fn<void, [DataReferenceItem]>();
  setupCardEndpoints(card);
  setupCardQueryMetadataEndpoint(card, {
    databases: [createSampleDatabase()],
    tables: [],
    fields: [],
  });
  setupCollectionByIdEndpoint({
    collections: [createMockCollection({ id: "root", name: "Our analytics" })],
  });

  renderWithProviders(
    <QuestionPane
      type="question"
      id={card.id}
      onItemClick={onItemClick}
      onBack={jest.fn()}
      onClose={jest.fn()}
    />,
  );
  await waitForLoaderToBeRemoved();

  return { onItemClick };
};

describe("QuestionPane", () => {
  it("should list columns of question with aggregation (metabase#86298)", async () => {
    const { onItemClick } = await setup({
      card: createMockCard({
        id: CARD_ID,
        name: "Orders count",
        database_id: SAMPLE_DB_ID,
        result_metadata: [
          createMockField({
            id: undefined,
            name: "count",
            display_name: "Count",
            base_type: "type/BigInteger",
            effective_type: "type/BigInteger",
            semantic_type: "type/Quantity",
            field_ref: ["aggregation", 0],
          }),
        ],
      }),
    });

    expect(screen.getByText("1 column")).toBeInTheDocument();
    expect(screen.getByLabelText("More info")).toBeInTheDocument();

    await userEvent.click(screen.getByText("count"));
    expect(onItemClick).toHaveBeenCalledWith({
      type: "field",
      kind: "card",
      cardId: CARD_ID,
      columnIndex: 0,
    });
  });
});
