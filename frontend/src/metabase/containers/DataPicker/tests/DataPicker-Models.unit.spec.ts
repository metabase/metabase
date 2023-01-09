import userEvent from "@testing-library/user-event";
import nock from "nock";

import { screen, waitFor } from "__support__/ui";
import { SAMPLE_DATABASE } from "__support__/sample_database_fixture";

import { ROOT_COLLECTION } from "metabase/entities/collections";
import {
  getCollectionVirtualSchemaId,
  getQuestionVirtualTableId,
  SAVED_QUESTIONS_VIRTUAL_DB_ID,
} from "metabase-lib/metadata/utils/saved-questions";

import {
  setup,
  EMPTY_COLLECTION,
  SAMPLE_COLLECTION,
  SAMPLE_MODEL,
  SAMPLE_MODEL_2,
  SAMPLE_MODEL_3,
} from "./common";

const ROOT_COLLECTION_MODEL_VIRTUAL_SCHEMA_ID = getCollectionVirtualSchemaId(
  ROOT_COLLECTION,
  { isDatasets: true },
);

describe("DataPicker — picking models", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it("opens the picker", async () => {
    await setup();

    userEvent.click(screen.getByText(/Models/i));
    await waitFor(() => screen.getByText(SAMPLE_MODEL.name));

    expect(screen.getByText(ROOT_COLLECTION.name)).toBeInTheDocument();
    expect(screen.getByText(SAMPLE_MODEL.name)).toBeInTheDocument();
    expect(screen.queryByText(/Raw Data/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Saved Questions/i)).not.toBeInTheDocument();
  });

  it("has empty state", async () => {
    await setup();

    userEvent.click(screen.getByText(/Saved Questions/i));
    userEvent.click(await screen.findByText(EMPTY_COLLECTION.name));

    expect(screen.getByText(/Nothing here/i)).toBeInTheDocument();
  });

  it("respects initial value", async () => {
    await setup({
      initialValue: {
        type: "models",
        databaseId: SAVED_QUESTIONS_VIRTUAL_DB_ID,
        schemaId: ROOT_COLLECTION_MODEL_VIRTUAL_SCHEMA_ID,
        collectionId: "root",
        tableIds: [getQuestionVirtualTableId(SAMPLE_MODEL.id)],
      },
    });

    const tableListItem = await screen.findByText(SAMPLE_MODEL.name);
    const collectionListItem = screen.getByText(ROOT_COLLECTION.name);

    expect(tableListItem.closest("li")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(collectionListItem.closest("li")).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("allows to pick a single model", async () => {
    const { onChange } = await setup();

    userEvent.click(screen.getByText(/Models/i));
    const listItem = await screen.findByText(SAMPLE_MODEL.name);
    userEvent.click(listItem);

    expect(listItem.closest("li")).toHaveAttribute("aria-selected", "true");
    expect(onChange).toBeCalledWith({
      type: "models",
      databaseId: SAVED_QUESTIONS_VIRTUAL_DB_ID,
      schemaId: ROOT_COLLECTION_MODEL_VIRTUAL_SCHEMA_ID,
      collectionId: "root",
      tableIds: [getQuestionVirtualTableId(SAMPLE_MODEL.id)],
    });
  });

  it("allows to pick multiple models", async () => {
    const { onChange } = await setup();

    userEvent.click(screen.getByText(/Models/i));
    userEvent.click(await screen.findByText(SAMPLE_MODEL.name));
    userEvent.click(screen.getByText(SAMPLE_MODEL_2.name));
    userEvent.click(screen.getByText(SAMPLE_MODEL_3.name));
    userEvent.click(screen.getByText(SAMPLE_MODEL.name));

    expect(onChange).toHaveBeenLastCalledWith({
      type: "models",
      databaseId: SAVED_QUESTIONS_VIRTUAL_DB_ID,
      schemaId: ROOT_COLLECTION_MODEL_VIRTUAL_SCHEMA_ID,
      collectionId: "root",
      tableIds: [SAMPLE_MODEL_2.id, SAMPLE_MODEL_3.id].map(
        getQuestionVirtualTableId,
      ),
    });
  });

  it("allows to return to the data type picker", async () => {
    await setup();

    userEvent.click(screen.getByText(/Models/i));
    await waitFor(() => screen.getByText(SAMPLE_MODEL.name));
    userEvent.click(screen.getByRole("button", { name: /Back/i }));

    expect(screen.getByText(/Models/i)).toBeInTheDocument();
    expect(screen.getByText(/Raw Data/i)).toBeInTheDocument();
    expect(screen.getByText(/Saved Questions/i)).toBeInTheDocument();
    expect(screen.queryByText(SAMPLE_MODEL.name)).not.toBeInTheDocument();
    expect(screen.queryByText(ROOT_COLLECTION.name)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Back/i }),
    ).not.toBeInTheDocument();
  });

  it("resets selection on collection change", async () => {
    const { onChange } = await setup();

    userEvent.click(screen.getByText(/Models/i));
    userEvent.click(await screen.findByText(SAMPLE_MODEL.name));
    userEvent.click(screen.getByText(SAMPLE_COLLECTION.name));

    expect(onChange).toHaveBeenLastCalledWith({
      type: "models",
      databaseId: SAVED_QUESTIONS_VIRTUAL_DB_ID,
      schemaId: getCollectionVirtualSchemaId(SAMPLE_COLLECTION, {
        isDatasets: true,
      }),
      collectionId: SAMPLE_COLLECTION.id,
      tableIds: [],
    });
  });

  it("resets selection when going back to data type picker", async () => {
    const { onChange } = await setup();

    userEvent.click(screen.getByText(/Models/i));
    userEvent.click(await screen.findByText(SAMPLE_MODEL.name));
    userEvent.click(screen.getByRole("button", { name: /Back/i }));

    expect(onChange).toHaveBeenLastCalledWith({
      type: undefined,
      databaseId: undefined,
      schemaId: undefined,
      collectionId: undefined,
      tableIds: [],
    });
  });

  it("hides section if there're no models available", async () => {
    await setup({ hasModels: false });

    expect(screen.queryByText(/Models/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Raw Data/i)).toBeInTheDocument();
    expect(screen.queryByText(/Saved Questions/i)).toBeInTheDocument();
  });

  it("hides section if nested queries are disabled", async () => {
    await setup({ hasNestedQueriesEnabled: false });

    // Models and saved questions shouldn't be available if nested queries are disabled
    // So we expect the picker to go straight to raw data section immediately
    expect(screen.queryByText(/Models/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Raw Data/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Saved Questions/i)).not.toBeInTheDocument();
    expect(screen.getByText(SAMPLE_DATABASE.displayName())).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Back/i }),
    ).not.toBeInTheDocument();
  });
});
