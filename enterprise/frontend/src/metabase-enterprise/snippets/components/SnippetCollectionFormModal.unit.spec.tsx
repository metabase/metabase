import React from "react";
import userEvent from "@testing-library/user-event";
import xhrMock from "xhr-mock";

import {
  act,
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";

import type { Collection } from "metabase-types/api";
import { createMockCollection } from "metabase-types/api/mocks";

import SnippetCollectionFormModal from "./SnippetCollectionFormModal";

const TOP_SNIPPETS_FOLDER = {
  id: "root",
  name: "Top folder",
  can_write: true,
};

type SetupOpts = {
  folder?: Partial<Collection>;
  onClose?: null | (() => void);
};

async function setup({ folder = {}, onClose = jest.fn() }: SetupOpts = {}) {
  xhrMock.get("/api/collection/root?namespace=snippets", {
    body: JSON.stringify(TOP_SNIPPETS_FOLDER),
  });

  xhrMock.get("/api/collection?namespace=snippets", {
    body: JSON.stringify([TOP_SNIPPETS_FOLDER]),
  });

  xhrMock.post("/api/collection", (req, res) =>
    res.status(200).body(createMockCollection(req.body())),
  );

  if (folder.id) {
    xhrMock.get(`/api/collection/${folder.id}?namespace=snippets`, (req, res) =>
      res.status(200).body(folder),
    );

    xhrMock.put(`/api/collection/${folder.id}`, (req, res) =>
      res.status(200).body(createMockCollection(req.body())),
    );
  }

  renderWithProviders(
    <SnippetCollectionFormModal
      collection={folder}
      onClose={onClose || undefined}
    />,
  );

  if (folder.id) {
    await waitForElementToBeRemoved(() => screen.getByText(/Loading/i));
  }

  return { onClose };
}

function setupEditing({
  folder = createMockCollection(),
  ...opts
}: SetupOpts = {}) {
  return setup({ folder, ...opts });
}

const LABEL = {
  NAME: /Give your folder a name/i,
  DESCRIPTION: /Add a description/i,
  FOLDER: /Folder this should be in/i,
};

describe("SnippetCollectionFormModal", () => {
  beforeEach(() => {
    xhrMock.setup();
  });

  afterEach(() => {
    xhrMock.teardown();
  });

  describe("new folder", () => {
    it("displays correct blank state", async () => {
      await setup();

      expect(screen.getByLabelText(LABEL.NAME)).toBeInTheDocument();
      expect(screen.getByLabelText(LABEL.NAME)).toHaveValue("");

      expect(screen.getByLabelText(LABEL.DESCRIPTION)).toBeInTheDocument();
      expect(screen.getByLabelText(LABEL.DESCRIPTION)).toHaveValue("");

      expect(screen.getByText(LABEL.FOLDER)).toBeInTheDocument();
      expect(screen.getByText(TOP_SNIPPETS_FOLDER.name)).toBeInTheDocument();

      expect(
        screen.getByRole("button", { name: "Cancel" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Create" }),
      ).toBeInTheDocument();
    });

    it("shows expected title", async () => {
      await setup();
      expect(screen.getByText(/Create your new folder/i)).toBeInTheDocument();
    });

    it("can't submit if name is empty", async () => {
      await setup();
      expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
    });

    it("can submit when name is filled in", async () => {
      await setup();

      await act(async () => {
        await userEvent.type(screen.getByLabelText(LABEL.NAME), "My folder");
      });

      expect(screen.getByRole("button", { name: "Create" })).not.toBeDisabled();
    });

    it("doesn't show cancel button if onClose props is not set", async () => {
      await setup({ onClose: null });
      expect(
        screen.queryByRole("button", { name: "Cancel" }),
      ).not.toBeInTheDocument();
    });

    it("calls onClose when cancel button is clicked", async () => {
      const { onClose } = await setup();
      userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("editing folder", () => {
    it("shows correct initial state", async () => {
      const folder = createMockCollection({ description: "has description" });
      await setupEditing({ folder });

      screen.debug();

      expect(screen.getByLabelText(LABEL.NAME)).toBeInTheDocument();
      expect(screen.getByLabelText(LABEL.NAME)).toHaveValue(folder.name);

      expect(screen.getByLabelText(LABEL.DESCRIPTION)).toBeInTheDocument();
      expect(screen.getByLabelText(LABEL.DESCRIPTION)).toHaveValue(
        folder.description,
      );

      expect(screen.getByText(LABEL.FOLDER)).toBeInTheDocument();
      expect(screen.getByText(TOP_SNIPPETS_FOLDER.name)).toBeInTheDocument();

      expect(
        screen.getByRole("button", { name: "Cancel" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Update" }),
      ).toBeInTheDocument();
    });

    it("shows expected title", async () => {
      const folder = createMockCollection();
      await setupEditing({ folder });
      expect(screen.getByText(`Editing ${folder.name}`)).toBeInTheDocument();
    });

    it("can't submit until changes are made", async () => {
      await setupEditing();
      expect(screen.getByRole("button", { name: "Update" })).toBeDisabled();
    });

    it("can't submit if name is empty", async () => {
      await setupEditing();
      await act(async () => {
        await userEvent.clear(screen.getByLabelText(LABEL.NAME));
      });
      expect(screen.getByRole("button", { name: "Update" })).toBeDisabled();
    });

    it("can submit when have changes", async () => {
      await setupEditing();
      userEvent.type(screen.getByLabelText(LABEL.NAME), "My folder");
      expect(screen.getByRole("button", { name: "Update" })).not.toBeDisabled();
    });

    it("doesn't show cancel button if onClose props is not set", async () => {
      await setupEditing({ onClose: null });
      expect(
        screen.queryByRole("button", { name: "Cancel" }),
      ).not.toBeInTheDocument();
    });

    it("calls onClose when cancel button is clicked", async () => {
      const { onClose } = await setupEditing();
      userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
