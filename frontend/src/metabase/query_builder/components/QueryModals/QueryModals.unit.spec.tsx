import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import type { ComponentProps } from "react";

import { createMockMetadataFromState } from "__support__/metadata";
import {
  setupCollectionsEndpoints,
  setupGetCollectionEndpoint,
} from "__support__/server-mocks";
import {
  createMockQueryBuilderState,
  createMockState,
} from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import { MODAL_TYPES } from "metabase/querying/constants";
import { defer } from "metabase/utils/promise";
import Question from "metabase-lib/v1/Question";
import type { Collection } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockUser,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { QueryModals } from "./QueryModals";

function setup({
  deferCollection = false,
  deferRootCollection = false,
  canWrite = true,
} = {}) {
  const collection = createMockCollection({ id: 1, name: "Reports" });
  const personalCollection = createMockCollection({ id: 2, name: "Personal" });
  const rootCollection = createMockCollection({
    id: "root",
    can_write: deferRootCollection,
  });
  const card = createMockCard({
    name: "Orders",
    description: "Original description",
    collection: canWrite ? collection : null,
    collection_id: collection.id,
    can_write: canWrite,
  });
  const createRequest = defer<Question>();
  const collectionRequest = defer<Collection>();
  const rootCollectionRequest = defer<Collection>();
  const onCreate = jest.fn((_question: Question) => createRequest.promise);
  const onCloseModal = jest.fn();
  const state = createMockState({
    currentUser: createMockUser({ personal_collection_id: 2 }),
    qb: createMockQueryBuilderState({ card }),
    entities: createMockEntitiesState({
      databases: [createSampleDatabase()],
      questions: [card],
    }),
  });
  const metadata = createMockMetadataFromState(state);
  const question = new Question(card, metadata);

  setupCollectionsEndpoints({
    collections: [collection, personalCollection],
    rootCollection,
  });
  setupGetCollectionEndpoint(collection);
  setupGetCollectionEndpoint(personalCollection);
  if (deferCollection) {
    fetchMock.modifyRoute(`get-collection-${collection.id}`, {
      response: () => collectionRequest.promise,
    });
  }
  if (deferRootCollection) {
    fetchMock.modifyRoute("collection-root", {
      response: () => rootCollectionRequest.promise,
    });
  }

  const props: ComponentProps<typeof QueryModals> = {
    modal: MODAL_TYPES.CLONE,
    question,
    originalQuestion: question,
    card,
    onCreate,
    onSave: jest.fn(),
    onCloseModal,
    onOpenModal: jest.fn(),
    onChangeLocation: jest.fn(),
    setQueryBuilderMode: jest.fn(),
  };
  const { rerender } = renderWithProviders(<QueryModals {...props} />, {
    storeInitialState: state,
  });

  return {
    card,
    collection,
    collectionRequest,
    createRequest,
    metadata,
    onCreate,
    onCloseModal,
    rootCollection,
    rootCollectionRequest,
    rerender: (updates: Partial<ComponentProps<typeof QueryModals>>) =>
      rerender(<QueryModals {...props} {...updates} />),
  };
}

describe("QueryModals", () => {
  it("should use the current question when the duplicate dialog is reopened", async () => {
    const { card, metadata, rerender } = setup();

    await screen.findByText("Reports");
    expect(screen.getByLabelText("Name")).toHaveValue("Orders - Duplicate");

    const updatedCard = createMockCard({
      ...card,
      id: 2,
      name: "Monthly orders",
    });
    const updatedQuestion = new Question(updatedCard, metadata);
    rerender({ modal: null, card: updatedCard, question: updatedQuestion });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    rerender({
      modal: MODAL_TYPES.CLONE,
      card: updatedCard,
      question: updatedQuestion,
    });

    expect(screen.getByLabelText("Name")).toHaveValue(
      "Monthly orders - Duplicate",
    );
    expect(
      screen.getByRole("dialog", { name: 'Duplicate "Monthly orders"' }),
    ).toBeInTheDocument();
  });

  it("should update the default collection when it loads", async () => {
    const { collection, collectionRequest } = setup({ deferCollection: true });

    expect(await screen.findByText("Personal")).toBeInTheDocument();

    await act(async () => collectionRequest.resolve(collection));

    expect(await screen.findByText("Reports")).toBeInTheDocument();
  });

  it("should update the default destination for a read-only question when permissions load", async () => {
    const { rootCollection, rootCollectionRequest } = setup({
      canWrite: false,
      deferRootCollection: true,
    });

    expect(await screen.findByText("Personal")).toBeInTheDocument();

    await act(async () => rootCollectionRequest.resolve(rootCollection));

    expect(await screen.findByText("Our analytics")).toBeInTheDocument();
  });

  it.each(["Monthly orders", "Orders - Duplicate"])(
    "should preserve the name %s while saving a duplicate (#83252)",
    async (name) => {
      const {
        card,
        createRequest,
        metadata,
        onCreate,
        onCloseModal,
        rerender,
      } = setup();

      await screen.findByText("Reports");
      await userEvent.clear(screen.getByLabelText("Name"));
      await userEvent.type(screen.getByLabelText("Name"), name);
      await userEvent.clear(screen.getByLabelText("Description"));
      await userEvent.type(
        screen.getByLabelText("Description"),
        "Copied description",
      );
      await userEvent.click(screen.getByRole("button", { name: "Duplicate" }));

      await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
      const [submittedQuestion] = onCreate.mock.calls[0];
      expect(submittedQuestion.displayName()).toBe(name);
      expect(submittedQuestion.description()).toBe("Copied description");

      const savedCard = createMockCard({
        ...card,
        id: 2,
        name,
        description: "Copied description",
      });
      const savedQuestion = new Question(savedCard, metadata);
      rerender({ question: savedQuestion, card: savedCard });

      expect(screen.getByLabelText("Name")).toHaveValue(name);
      expect(screen.getByLabelText("Description")).toHaveValue(
        "Copied description",
      );
      expect(
        screen.getByRole("dialog", { name: 'Duplicate "Orders"' }),
      ).toBeInTheDocument();
      expect(onCloseModal).not.toHaveBeenCalled();

      await act(async () => createRequest.resolve(savedQuestion));

      expect(onCloseModal).toHaveBeenCalled();
    },
  );
});
