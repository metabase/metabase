import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { createMockMetadata } from "__support__/metadata";
import { setupNativeQuerySnippetEndpoints } from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { Database } from "metabase-types/api";
import {
  createMockDatabase,
  createMockField,
  createMockTable,
} from "metabase-types/api/mocks";

import { NotebookNativePreview } from "./NotebookNativePreview";

const DB_ID = 2;
const TABLE_ID = 20;

function createDatabase(engine: string): Database {
  return createMockDatabase({
    id: DB_ID,
    engine,
    features:
      engine === "mongo" ? ["native-requires-specified-collection"] : [],
    tables: [
      createMockTable({
        id: TABLE_ID,
        db_id: DB_ID,
        name: "products",
        fields: [createMockField({ id: 200, table_id: TABLE_ID })],
      }),
    ],
  });
}

function setup({
  engine,
  collection,
}: {
  engine: string;
  collection?: string;
}) {
  const database = createDatabase(engine);
  const metadata = createMockMetadata({ databases: [database] });
  const question = checkNotNull(metadata.table(TABLE_ID)).question();
  const onConvertClick = jest.fn<void, [Question]>();

  setupNativeQuerySnippetEndpoints();
  fetchMock.post("path:/api/dataset/native", {
    query: "native query",
    collection,
    params: null,
  });

  renderWithProviders(
    <NotebookNativePreview
      question={question}
      onConvertClick={onConvertClick}
    />,
    {
      storeInitialState: createMockState({
        entities: createMockEntitiesState({ databases: [database] }),
      }),
    },
  );

  return { onConvertClick };
}

async function findConvertButton(name: string) {
  const button = await screen.findByRole("button", { name });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}

describe("NotebookNativePreview", () => {
  it("should use SQL labels for a SQL database", async () => {
    setup({ engine: "h2" });

    expect(screen.getByText("SQL for this question")).toBeInTheDocument();
    expect(
      await findConvertButton("Convert this question to SQL"),
    ).toBeInTheDocument();
  });

  it("should use native query labels and keep the collection for a MongoDB database", async () => {
    const { onConvertClick } = setup({
      engine: "mongo",
      collection: "products",
    });

    expect(
      screen.getByText("Native query for this question"),
    ).toBeInTheDocument();
    await userEvent.click(
      await findConvertButton("Convert this question to a native query"),
    );

    expect(onConvertClick).toHaveBeenCalledTimes(1);
    const query = onConvertClick.mock.calls[0][0].query();
    expect(Lib.databaseID(query)).toBe(DB_ID);
    expect(Lib.nativeExtras(query)).toEqual({ collection: "products" });
  });
});
