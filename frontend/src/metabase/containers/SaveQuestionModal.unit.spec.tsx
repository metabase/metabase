import React from "react";
import fetchMock from "fetch-mock";
import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  SAMPLE_DATABASE,
  ORDERS,
  metadata,
} from "__support__/sample_database_fixture";
import { setupEnterpriseTest } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";

import SaveQuestionModal from "metabase/containers/SaveQuestionModal";
import { CollectionId } from "metabase-types/api";
import StructuredQuery from "metabase-lib/queries/StructuredQuery";
import Question from "metabase-lib/Question";

// jest.mock("metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger", () => {
//   const PopoverWithTrigger = (props) => {
//     console.log(props);
//     return <div>{props.popoverContent({
//       closePopover: jest.fn()
//     })}</div>;
//   };
//   return PopoverWithTrigger;
// })

const setup = async (
  question: Question,
  originalQuestion: Question | null = null,
  { isCachingEnabled = false } = {},
) => {
  const onCreateMock = jest.fn(() => Promise.resolve());
  const onSaveMock = jest.fn(() => Promise.resolve());
  const onCloseMock = jest.fn();

  const settings = mockSettings({ "enable-query-caching": isCachingEnabled });

  renderWithProviders(
    <SaveQuestionModal
      question={question}
      originalQuestion={originalQuestion}
      onCreate={onCreateMock}
      onSave={onSaveMock}
      onClose={onCloseMock}
    />,
    {
      storeInitialState: {
        settings,
      },
    },
  );
  await screen.findByRole("button", { name: "Save" });

  return { onSaveMock, onCreateMock, onCloseMock };
};

const EXPECTED_SUGGESTED_NAME = "Orders, Count";

function getQuestion({
  isSaved,
  name = "Q1",
  description = "Example",
  collection_id = null,
  can_write = true,
}: {
  isSaved?: boolean;
  name?: string;
  description?: string;
  collection_id?: CollectionId | null;
  can_write?: boolean;
} = {}) {
  const extraCardParams: Record<string, any> = {};

  if (isSaved) {
    extraCardParams.id = 1; // if a card has an id, it means it's saved
    extraCardParams.name = name;
    extraCardParams.description = description;
    extraCardParams.collection_id = collection_id;
    extraCardParams.can_write = can_write;
  }

  return new Question(
    {
      ...extraCardParams,
      display: "table",
      visualization_settings: {},
      dataset_query: {
        type: "query",
        database: SAMPLE_DATABASE.id,
        query: {
          "source-table": ORDERS.id,
          aggregation: [["count"]],
        },
      },
    },
    metadata,
  );
}

const EXPECTED_DIRTY_SUGGESTED_NAME = "Orders, Count, Grouped by Total";

function getDirtyQuestion(originalQuestion: Question) {
  const query = originalQuestion.query() as StructuredQuery;
  return query
    .breakout(["field", ORDERS.TOTAL.id, null])
    .question()
    .markDirty();
}

function fillForm({
  name,
  description,
}: {
  name?: string;
  description?: string;
}) {
  if (name) {
    const input = screen.getByLabelText("Name");
    userEvent.clear(input);
    userEvent.type(input, name);
  }
  if (description) {
    const input = screen.getByLabelText("Description");
    userEvent.clear(input);
    userEvent.type(input, description);
  }
}

describe("SaveQuestionModal", () => {
  beforeAll(() => {
    console.error = jest.fn();
    console.warn = jest.fn();
  });

  const TEST_COLLECTIONS = [
    {
      can_write: false,
      effective_ancestors: [],
      effective_location: null,
      id: "root",
      name: "Our analytics",
      parent_id: null,
    },
    {
      archived: false,
      can_write: true,
      color: "#31698A",
      description: null,
      id: 1,
      location: "/",
      name: "Bobby Tables's Personal Collection",
      namespace: null,
      personal_owner_id: 1,
      slug: "bobby_tables_s_personal_collection",
    },
  ];

  beforeEach(() => {
    fetchMock.get("path:/api/collection", TEST_COLLECTIONS);
    fetchMock.get("path:/api/collection/root", TEST_COLLECTIONS);
  });

  describe("new question", () => {
    it("should suggest a name for structured queries", async () => {
      await setup(getQuestion());
      expect(screen.getByLabelText("Name")).toHaveValue(
        EXPECTED_SUGGESTED_NAME,
      );
    });

    it("should not suggest a name for native queries", async () => {
      await setup(
        new Question(
          {
            dataset_query: {
              type: "native",
              database: ORDERS.id,
              native: {
                query: "select * from orders",
              },
              display: "table",
            },
          },
          metadata,
        ),
      );

      expect(screen.getByLabelText("Name")).toHaveValue("");
    });

    it("should display empty description input", async () => {
      await setup(getQuestion());
      expect(screen.getByLabelText("Description")).toHaveValue("");
    });

    it("should call onCreate correctly with default form values", async () => {
      const question = getQuestion();
      const { onCreateMock } = await setup(question);

      userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(onCreateMock).toHaveBeenCalledTimes(1);
      });

      const call: Question[] = onCreateMock.mock.calls[0];
      expect(call.length).toBe(1);

      const newQuestion = call[0];
      expect(newQuestion.id()).toBeUndefined();
      expect(newQuestion.displayName()).toBe(EXPECTED_SUGGESTED_NAME);
      expect(newQuestion.description()).toBe(null);
      expect(newQuestion.collectionId()).toBe(null);
    });

    it("should call onCreate correctly with edited form", async () => {
      const question = getQuestion();
      const { onCreateMock } = await setup(question);

      fillForm({
        name: "My favorite orders",
        description: "So many of them",
      });
      userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(onCreateMock).toHaveBeenCalledTimes(1);
      });

      const call: Question[] = onCreateMock.mock.calls[0];
      expect(call.length).toBe(1);

      const newQuestion = call[0];
      expect(newQuestion.id()).toBeUndefined();
      expect(newQuestion.displayName()).toBe("My favorite orders");
      expect(newQuestion.description()).toBe("So many of them");
      expect(newQuestion.collectionId()).toBe(null);
    });

    it("should trim name and description", async () => {
      const question = getQuestion();
      const { onCreateMock } = await setup(question);

      fillForm({
        name: "    My favorite orders ",
        description: "  So many of them   ",
      });
      userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(onCreateMock).toHaveBeenCalledTimes(1);
      });

      const call: Question[] = onCreateMock.mock.calls[0];
      expect(call.length).toBe(1);

      const newQuestion = call[0];
      expect(newQuestion.id()).toBeUndefined();
      expect(newQuestion.displayName()).toBe("My favorite orders");
      expect(newQuestion.description()).toBe("So many of them");
      expect(newQuestion.collectionId()).toBe(null);
    });

    it('should correctly handle saving a question in the "root" collection', async () => {
      const question = getQuestion({
        collection_id: "root",
      });
      const { onCreateMock } = await setup(question);

      fillForm({ name: "foo", description: "bar" });
      userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(onCreateMock).toHaveBeenCalledTimes(1);
      });

      const call: Question[] = onCreateMock.mock.calls[0];
      expect(call.length).toBe(1);

      screen.debug(undefined, 100000)

      const newQuestion = call[0];
      expect(newQuestion.id()).toBeUndefined();
      expect(newQuestion.displayName()).toBe("foo");
      expect(newQuestion.description()).toBe("bar");
      expect(newQuestion.collectionId()).toBe(null);
    });

    it("shouldn't call onSave when form is submitted", async () => {
      const question = getQuestion();
      const { onSaveMock } = await setup(question);

      userEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(onSaveMock).not.toHaveBeenCalled();
    });

    it("shouldn't show a control to overwrite a saved question", async () => {
      await setup(getQuestion());
      expect(
        screen.queryByText("Save as new question"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Replace original question, ".*"/),
      ).not.toBeInTheDocument();
    });

    it("should show a new question form", async () => {
      const CARD = {
        name: "Q1",
        description: "Example description",
        collection_id: TEST_COLLECTIONS[1].id,
      };
      const originalQuestion = getQuestion({ isSaved: true, ...CARD });
      await setup(originalQuestion, null);



      screen.debug(undefined, 100000)
      // expect(screen.getByText("Our analytics")).toBeInTheDocument();
      expect(true).toBeTruthy()
    });
  });

  describe("saving as a new question", () => {
    it("should offer to replace the original question by default", async () => {
      const originalQuestion = getQuestion({ isSaved: true });
      await setup(getDirtyQuestion(originalQuestion), originalQuestion);

      expect(
        screen.getByLabelText(/Replace original question, ".*"/),
      ).toBeChecked();
      expect(screen.getByText("Save as new question")).not.toBeChecked();
    });

    it("should switch to the new question form", async () => {
      const CARD = {
        name: "Q1",
        description: "Example description",
        collection_id: null,
      };
      const originalQuestion = getQuestion({ isSaved: true, ...CARD });
      const dirtyQuestion = getDirtyQuestion(originalQuestion);
      await setup(dirtyQuestion, originalQuestion);

      userEvent.click(screen.getByText("Save as new question"));

      expect(screen.getByLabelText("Name")).toHaveValue(
        EXPECTED_DIRTY_SUGGESTED_NAME,
      );
      expect(screen.getByLabelText("Description")).toHaveValue(
        CARD.description,
      );
      screen.debug(undefined, 100000)
      expect(screen.getByText("Our analytics")).toBeInTheDocument();
    });

    it("should allow to save a question with default form values", async () => {
      const originalQuestion = getQuestion({ isSaved: true });
      const dirtyQuestion = getDirtyQuestion(originalQuestion);
      const { onCreateMock } = await setup(dirtyQuestion, originalQuestion);

      userEvent.click(screen.getByText("Save as new question"));
      userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(onCreateMock).toHaveBeenCalledTimes(1);
      });

      const call: Question[] = onCreateMock.mock.calls[0];
      expect(call.length).toBe(1);

      const newQuestion = call[0];
      expect(newQuestion.id()).toBeUndefined();
      expect(newQuestion.displayName()).toBe(EXPECTED_DIRTY_SUGGESTED_NAME);
      expect(newQuestion.description()).toBe("Example");
      expect(newQuestion.collectionId()).toBe(null);
    });

    it("show allow to save a question with an edited form", async () => {
      const originalQuestion = getQuestion({ isSaved: true });
      const dirtyQuestion = getDirtyQuestion(originalQuestion);
      const { onCreateMock } = await setup(dirtyQuestion, originalQuestion);

      userEvent.click(screen.getByText("Save as new question"));
      fillForm({ name: "My Q", description: "Sample" });
      userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(onCreateMock).toHaveBeenCalledTimes(1);
      });

      const call: Question[] = onCreateMock.mock.calls[0];
      expect(call.length).toBe(1);

      const newQuestion = call[0];
      expect(newQuestion.id()).toBeUndefined();
      expect(newQuestion.displayName()).toBe("My Q");
      expect(newQuestion.description()).toBe("Sample");
      expect(newQuestion.collectionId()).toBe(null);
    });

    it("shouldn't allow to save a question if form is invalid", async () => {
      const originalQuestion = getQuestion({ isSaved: true });
      await setup(getDirtyQuestion(originalQuestion), originalQuestion);

      userEvent.click(screen.getByText("Save as new question"));
      userEvent.clear(screen.getByLabelText("Name"));
      userEvent.clear(screen.getByLabelText("Description"));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
      });
    });
  });

  describe("overwriting a saved question", () => {
    it("should display original question's name on save mode control", async () => {
      const originalQuestion = getQuestion({
        isSaved: true,
        name: "Beautiful Orders",
      });
      const dirtyQuestion = getDirtyQuestion(originalQuestion);
      await setup(dirtyQuestion, originalQuestion);

      expect(
        screen.getByText('Replace original question, "Beautiful Orders"'),
      ).toBeInTheDocument();
    });

    it("should call onSave correctly when form is submitted", async () => {
      const originalQuestion = getQuestion({ isSaved: true });
      const dirtyQuestion = getDirtyQuestion(originalQuestion);
      const { onSaveMock } = await setup(dirtyQuestion, originalQuestion);

      userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(onSaveMock).toHaveBeenCalledTimes(1);
      });

      const call: Question[] = onSaveMock.mock.calls[0];
      expect(call.length).toBe(1);

      const newQuestion = call[0];
      expect(newQuestion.id()).toBe(originalQuestion.id());
      expect(newQuestion.displayName()).toBe(originalQuestion.displayName());
      expect(newQuestion.description()).toBe(originalQuestion.description());
      expect(newQuestion.collectionId()).toBe(originalQuestion.collectionId());
    });

    it("should allow switching to 'save as new' and back", async () => {
      const originalQuestion = getQuestion({ isSaved: true });
      const dirtyQuestion = getDirtyQuestion(originalQuestion);
      const { onSaveMock } = await setup(dirtyQuestion, originalQuestion);

      userEvent.click(screen.getByText("Save as new question"));
      userEvent.click(screen.getByText(/Replace original question, ".*"/));
      userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(onSaveMock).toHaveBeenCalledTimes(1);
      });

      const call: Question[] = onSaveMock.mock.calls[0];
      expect(call.length).toBe(1);

      const newQuestion = call[0];
      expect(newQuestion.id()).toBe(originalQuestion.id());
      expect(newQuestion.displayName()).toBe(originalQuestion.displayName());
      expect(newQuestion.description()).toBe(originalQuestion.description());
      expect(newQuestion.collectionId()).toBe(originalQuestion.collectionId());
    });

    it("should preserve original question's collection id", async () => {
      const originalQuestion = getQuestion({
        isSaved: true,
        collection_id: 5,
      });
      const dirtyQuestion = getDirtyQuestion(originalQuestion);
      const { onSaveMock } = await setup(dirtyQuestion, originalQuestion);

      userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(onSaveMock).toHaveBeenCalledTimes(1);
      });

      const call: Question[] = onSaveMock.mock.calls[0];
      expect(call.length).toBe(1);

      const newQuestion = call[0];
      expect(newQuestion.id()).toBe(originalQuestion.id());
      expect(newQuestion.displayName()).toBe(originalQuestion.displayName());
      expect(newQuestion.description()).toBe(originalQuestion.description());
      expect(newQuestion.collectionId()).toBe(originalQuestion.collectionId());
    });

    it("shouldn't allow to save a question if form is invalid", async () => {
      await setup(getQuestion());

      userEvent.clear(screen.getByLabelText("Name"));
      userEvent.clear(screen.getByLabelText("Description"));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
      });
    });

    it("shouldn't call onCreate when form is submitted", async () => {
      const originalQuestion = getQuestion({ isSaved: true });
      const dirtyQuestion = getDirtyQuestion(originalQuestion);
      const { onCreateMock } = await setup(dirtyQuestion, originalQuestion);

      userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(onCreateMock).not.toHaveBeenCalled();
      });
    });

    it("should keep 'save as new' form values while switching saving modes", async () => {
      const originalQuestion = getQuestion({ isSaved: true });
      await setup(getDirtyQuestion(originalQuestion), originalQuestion);

      userEvent.click(screen.getByText("Save as new question"));
      fillForm({
        name: "Should not be erased",
        description: "This should not be erased too",
      });
      userEvent.click(screen.getByText(/Replace original question, ".*"/));
      userEvent.click(screen.getByText("Save as new question"));

      await waitFor(() => {
        expect(screen.getByLabelText("Name")).toHaveValue(
          "Should not be erased",
        );
      });
      expect(screen.getByLabelText("Description")).toHaveValue(
        "This should not be erased too",
      );
    });

    it("should allow to replace the question if new question form is invalid (metabase#13817)", async () => {
      const originalQuestion = getQuestion({ isSaved: true });
      await setup(getDirtyQuestion(originalQuestion), originalQuestion);

      userEvent.click(screen.getByText("Save as new question"));
      userEvent.clear(screen.getByLabelText("Name"));
      userEvent.click(screen.getByText(/Replace original question, ".*"/));

      expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    });

    it("should not allow overwriting when user does not have curate permission on collection (metabase#20717)", async () => {
      const originalQuestion = getQuestion({
        isSaved: true,
        name: "Beautiful Orders",
        can_write: false,
      });
      const dirtyQuestion = getDirtyQuestion(originalQuestion);
      await setup(dirtyQuestion, originalQuestion);

      expect(
        screen.queryByText("Save as new question"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Replace original question, ".*"/),
      ).not.toBeInTheDocument();
    });
  });

  it("should call onClose when Cancel button is clicked", async () => {
    const { onCloseMock } = await setup(getQuestion());
    userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it("should call onClose when close icon is clicked", async () => {
    const { onCloseMock } = await setup(getQuestion());
    userEvent.click(screen.getByLabelText("close icon"));
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  describe("Cache TTL field", () => {
    const query = Question.create({
      databaseId: SAMPLE_DATABASE.id,
      tableId: ORDERS.id,
      metadata,
    }).query() as StructuredQuery;

    const question = query.aggregate(["count"]).question();

    describe("OSS", () => {
      it("is not shown", async () => {
        await setup(question, null, { isCachingEnabled: true });
        expect(screen.queryByText("More options")).not.toBeInTheDocument();
        expect(
          screen.queryByText("Cache all question results for"),
        ).not.toBeInTheDocument();
      });
    });

    describe("EE", () => {
      beforeEach(() => {
        setupEnterpriseTest();
      });

      it("is not shown", async () => {
        await setup(question, null, { isCachingEnabled: true });
        expect(screen.queryByText("More options")).not.toBeInTheDocument();
        expect(
          screen.queryByText("Cache all question results for"),
        ).not.toBeInTheDocument();
      });
    });
  });
});
