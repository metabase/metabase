import userEvent from "@testing-library/user-event";

import { setupCollectionItemsEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
import type { CollectionOrTableIdProps } from "metabase/common/collections/types";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockLastEditInfo,
} from "metabase-types/api/mocks";

import { ModelUploadModal } from "./ModelUploadModal";

const COLLECTION = createMockCollection({ id: 1 });

// Model B was edited more recently, so it is the default selection.
const MODEL_A = createMockCollectionItem({
  id: 10,
  model: "dataset",
  name: "Model A",
  based_on_upload: 100,
  "last-edit-info": createMockLastEditInfo({
    timestamp: "2024-01-01T00:00:00Z",
  }),
});

const MODEL_B = createMockCollectionItem({
  id: 20,
  model: "dataset",
  name: "Model B",
  based_on_upload: 200,
  "last-edit-info": createMockLastEditInfo({
    timestamp: "2024-02-01T00:00:00Z",
  }),
});

function setup() {
  setupCollectionItemsEndpoint({
    collection: COLLECTION,
    collectionItems: [MODEL_A, MODEL_B],
    models: ["dataset"],
  });

  const onUpload = jest.fn<void, [CollectionOrTableIdProps]>();
  const onClose = jest.fn();

  renderWithProviders(
    <ModelUploadModal
      opened
      onClose={onClose}
      onUpload={onUpload}
      collectionId={COLLECTION.id}
    />,
  );

  return { onUpload, onClose };
}

describe("ModelUploadModal", () => {
  it("lets you pick a model to append to and keeps that selection (metabase#53824)", async () => {
    setup();

    expect(
      await screen.findByText("Select upload destination"),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("radio", { name: /Append to a model/ }),
    );

    const select = screen.getByRole("textbox", { name: "Select a model" });
    // Defaults to the most recently edited model.
    expect(select).toHaveValue("Model B");

    // Choose the other model from the dropdown.
    await userEvent.click(select);
    const listbox = await screen.findByRole("listbox");
    await userEvent.click(
      within(listbox).getByRole("option", { name: "Model A" }),
    );

    // The chosen model must stick and not snap back to the default.
    expect(screen.getByRole("textbox", { name: "Select a model" })).toHaveValue(
      "Model A",
    );
  });
});
