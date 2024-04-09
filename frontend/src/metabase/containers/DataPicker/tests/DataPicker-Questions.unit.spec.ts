import userEvent from "@testing-library/user-event";

import { screen, waitForLoaderToBeRemoved } from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import {
  getCollectionVirtualSchemaId,
  getQuestionVirtualTableId,
  SAVED_QUESTIONS_VIRTUAL_DB_ID,
} from "metabase-lib/v1/metadata/utils/saved-questions";

import {
  EMPTY_COLLECTION,
  SAMPLE_COLLECTION,
  SAMPLE_MODEL,
  SAMPLE_QUESTION,
  SAMPLE_QUESTION_2,
  SAMPLE_QUESTION_3,
  setup,
} from "./common";

const ROOT_COLLECTION_QUESTIONS_VIRTUAL_SCHEMA_ID =
  getCollectionVirtualSchemaId(ROOT_COLLECTION);

describe("DataPicker — picking questions", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
  });

  it("opens the picker", async () => {
    await setup();

    await userEvent.click(screen.getByText(/Saved Questions/i));

    expect(await screen.findByText(SAMPLE_QUESTION.name)).toBeInTheDocument();
    expect(screen.getByText(ROOT_COLLECTION.name)).toBeInTheDocument();
    expect(screen.queryByText(/Models/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Raw Data/i)).not.toBeInTheDocument();
  });

  it("has empty state", async () => {
    await setup();

    await userEvent.click(screen.getByText(/Saved Questions/i));
    await userEvent.click(await screen.findByText(EMPTY_COLLECTION.name));

    expect(screen.getByText(/Nothing here/i)).toBeInTheDocument();
  });

  it("doesn't show section when there are no saved questions", async () => {
    await setup({ hasSavedQuestions: false });
    expect(screen.queryByText(/Saved Questions/i)).not.toBeInTheDocument();
  });

  it("respects initial value", async () => {
    await setup({
      initialValue: {
        type: "models",
        databaseId: SAVED_QUESTIONS_VIRTUAL_DB_ID,
        schemaId: ROOT_COLLECTION_QUESTIONS_VIRTUAL_SCHEMA_ID,
        collectionId: "root",
        tableIds: [getQuestionVirtualTableId(SAMPLE_QUESTION.id)],
      },
    });

    const tableListItem = await screen.findByRole("menuitem", {
      name: SAMPLE_QUESTION.name,
    });
    const collectionListItem = screen.getByRole("menuitem", {
      name: ROOT_COLLECTION.name,
    });

    expect(tableListItem).toHaveAttribute("aria-selected", "true");
    expect(collectionListItem).toHaveAttribute("aria-selected", "true");
  });

  it("allows to pick a single question", async () => {
    const { onChange } = await setup();

    await userEvent.click(screen.getByText(/Saved Questions/i));
    await userEvent.click(await screen.findByText(SAMPLE_QUESTION.name));
    await userEvent.click(screen.getByText(SAMPLE_QUESTION_2.name));

    const selectedItem = screen.getByRole("menuitem", {
      name: SAMPLE_QUESTION_2.name,
    });
    expect(selectedItem).toHaveAttribute("aria-selected", "true");
    expect(onChange).toHaveBeenCalledWith({
      type: "questions",
      databaseId: SAVED_QUESTIONS_VIRTUAL_DB_ID,
      schemaId: ROOT_COLLECTION_QUESTIONS_VIRTUAL_SCHEMA_ID,
      collectionId: "root",
      tableIds: [getQuestionVirtualTableId(SAMPLE_QUESTION_2.id)],
    });
  });

  it("allows to pick multiple questions", async () => {
    const { onChange } = await setup({ isMultiSelect: true });

    await userEvent.click(screen.getByText(/Saved Questions/i));
    await userEvent.click(await screen.findByText(SAMPLE_QUESTION.name));
    await userEvent.click(screen.getByText(SAMPLE_QUESTION_2.name));
    await userEvent.click(screen.getByText(SAMPLE_QUESTION_3.name));
    await userEvent.click(screen.getByText(SAMPLE_QUESTION.name));

    expect(onChange).toHaveBeenLastCalledWith({
      type: "questions",
      databaseId: SAVED_QUESTIONS_VIRTUAL_DB_ID,
      schemaId: ROOT_COLLECTION_QUESTIONS_VIRTUAL_SCHEMA_ID,
      collectionId: "root",
      tableIds: [SAMPLE_QUESTION_2.id, SAMPLE_QUESTION_3.id].map(
        getQuestionVirtualTableId,
      ),
    });
  });

  it("allows to return to the data type picker", async () => {
    await setup();

    await userEvent.click(screen.getByText(/Saved Questions/i));
    await waitForLoaderToBeRemoved();
    await userEvent.click(screen.getByRole("button", { name: /Back/i }));

    expect(screen.getByText(/Models/i)).toBeInTheDocument();
    expect(screen.getByText(/Raw Data/i)).toBeInTheDocument();
    expect(screen.getByText(/Saved Questions/i)).toBeInTheDocument();
    expect(screen.queryByText(SAMPLE_QUESTION.name)).not.toBeInTheDocument();
    expect(screen.queryByText(ROOT_COLLECTION.name)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Back/i }),
    ).not.toBeInTheDocument();
  });

  it("resets selection on collection change", async () => {
    const { onChange } = await setup();

    await userEvent.click(screen.getByText(/Saved Questions/i));
    await waitForLoaderToBeRemoved();
    await userEvent.click(screen.getByText(SAMPLE_COLLECTION.name));

    expect(onChange).toHaveBeenLastCalledWith({
      type: "questions",
      databaseId: SAVED_QUESTIONS_VIRTUAL_DB_ID,
      schemaId: getCollectionVirtualSchemaId(SAMPLE_COLLECTION),
      collectionId: SAMPLE_COLLECTION.id,
      tableIds: [],
    });
  });

  it("resets selection when going back to data type picker", async () => {
    const { onChange } = await setup();

    await userEvent.click(screen.getByText(/Saved Questions/i));
    const tableListItem = await screen.findByText(SAMPLE_QUESTION.name);
    await userEvent.click(tableListItem);
    await userEvent.click(screen.getByRole("button", { name: /Back/i }));

    expect(onChange).toHaveBeenLastCalledWith({
      type: undefined,
      databaseId: undefined,
      schemaId: undefined,
      collectionId: undefined,
      tableIds: [],
    });
  });

  it("should be able to search for a question", async () => {
    const { onChange } = await setup({
      filters: {
        types: type => type === "questions",
      },
    });

    await userEvent.type(screen.getByRole("textbox"), SAMPLE_QUESTION.name);
    expect(await screen.findByText(SAMPLE_QUESTION.name)).toBeInTheDocument();
    expect(screen.queryByText(SAMPLE_MODEL.name)).not.toBeInTheDocument();

    await userEvent.click(screen.getByText(SAMPLE_QUESTION.name));
    expect(onChange).toHaveBeenLastCalledWith({
      type: "questions",
      databaseId: SAVED_QUESTIONS_VIRTUAL_DB_ID,
      schemaId: getCollectionVirtualSchemaId(SAMPLE_COLLECTION),
      collectionId: SAMPLE_QUESTION.collection_id,
      tableIds: [getQuestionVirtualTableId(SAMPLE_QUESTION.id)],
    });
  });

  it("should be able to search for a question when a model was selected", async () => {
    const { onChange } = await setup({
      initialValue: {
        type: "questions",
        databaseId: SAVED_QUESTIONS_VIRTUAL_DB_ID,
        schemaId: getCollectionVirtualSchemaId(SAMPLE_COLLECTION, {
          isDatasets: true,
        }),
        collectionId: "root",
        tableIds: [getQuestionVirtualTableId(SAMPLE_MODEL.id)],
      },
    });

    await userEvent.type(screen.getByRole("textbox"), "Sample");
    expect(await screen.findByText(SAMPLE_QUESTION.name)).toBeInTheDocument();
    expect(screen.getByText(SAMPLE_MODEL.name)).toBeInTheDocument();

    await userEvent.click(screen.getByText(SAMPLE_QUESTION.name));
    expect(onChange).toHaveBeenLastCalledWith({
      type: "questions",
      databaseId: SAVED_QUESTIONS_VIRTUAL_DB_ID,
      schemaId: getCollectionVirtualSchemaId(SAMPLE_COLLECTION),
      collectionId: SAMPLE_QUESTION.collection_id,
      tableIds: [getQuestionVirtualTableId(SAMPLE_QUESTION.id)],
    });
  });
});
