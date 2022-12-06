import React from "react";
import userEvent from "@testing-library/user-event";
import xhrMock from "xhr-mock";

import {
  act,
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import { setupEnterpriseTest } from "__support__/enterprise";

import type { NativeQuerySnippet } from "metabase-types/api";
import {
  createMockCollection,
  createMockNativeQuerySnippet,
} from "metabase-types/api/mocks";

import SnippetFormModal from "./SnippetFormModal";

const TOP_SNIPPETS_FOLDER = {
  id: "root",
  name: "Top folder",
  can_write: true,
};

type SetupOpts = {
  snippet?: Partial<NativeQuerySnippet>;
  onClose?: null | (() => void);
  withDefaultFoldersList?: boolean;
};

async function setup({
  snippet = {},
  withDefaultFoldersList = true,
  onClose = jest.fn(),
}: SetupOpts = {}) {
  xhrMock.get("/api/collection/root?namespace=snippets", {
    body: JSON.stringify(TOP_SNIPPETS_FOLDER),
  });

  if (withDefaultFoldersList) {
    xhrMock.get("/api/collection?namespace=snippets", {
      body: JSON.stringify([TOP_SNIPPETS_FOLDER]),
    });
  }

  xhrMock.post("/api/native-query-snippet", (req, res) =>
    res.status(200).body(createMockNativeQuerySnippet(req.body())),
  );

  if (snippet.id) {
    xhrMock.put(`/api/native-query-snippet/${snippet.id}`, (req, res) =>
      res.status(200).body(createMockNativeQuerySnippet(req.body())),
    );
  }

  renderWithProviders(
    <SnippetFormModal snippet={snippet} onClose={onClose || undefined} />,
  );

  await waitForElementToBeRemoved(() => screen.getByText(/Loading/i));

  return { onClose };
}

function setupEditing({
  snippet = createMockNativeQuerySnippet(),
  ...opts
}: SetupOpts = {}) {
  return setup({ snippet, ...opts });
}

const LABEL = {
  NAME: /Give your snippet a name/i,
  DESCRIPTION: /Add a description/i,
  CONTENT: /Enter some SQL here so you can reuse it later/i,
  FOLDER: /Folder this should be in/i,
};

describe("SnippetFormModal", () => {
  beforeEach(() => {
    xhrMock.setup();
  });

  afterEach(() => {
    xhrMock.teardown();
  });

  describe("new snippet", () => {
    it("displays correct blank state", async () => {
      await setup();

      expect(screen.getByLabelText(LABEL.NAME)).toBeInTheDocument();
      expect(screen.getByLabelText(LABEL.NAME)).toHaveValue("");

      expect(screen.getByLabelText(LABEL.DESCRIPTION)).toBeInTheDocument();
      expect(screen.getByLabelText(LABEL.DESCRIPTION)).toHaveValue("");

      expect(screen.getByLabelText(LABEL.CONTENT)).toBeInTheDocument();
      expect(screen.getByLabelText(LABEL.CONTENT)).toHaveValue("");

      expect(screen.queryByText(LABEL.FOLDER)).not.toBeInTheDocument();

      expect(
        screen.getByRole("button", { name: "Cancel" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    });

    it("shows expected title", async () => {
      await setup();
      expect(screen.getByText(/Create your new snippet/i)).toBeInTheDocument();
    });

    it("shows folder picker if there are many folders", async () => {
      xhrMock.get("/api/collection?namespace=snippets", {
        body: JSON.stringify([TOP_SNIPPETS_FOLDER, createMockCollection()]),
      });

      await setup({ withDefaultFoldersList: false });

      expect(screen.getByText(LABEL.FOLDER)).toBeInTheDocument();
      expect(screen.getByText(TOP_SNIPPETS_FOLDER.name)).toBeInTheDocument();
    });

    it("can't submit if content is empty", async () => {
      await setup();
      userEvent.type(screen.getByLabelText(LABEL.NAME), "My snippet");
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    });

    it("can't submit if name is empty", async () => {
      await setup();
      userEvent.type(
        screen.getByLabelText(LABEL.CONTENT),
        "WHERE discount > 0",
      );
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    });

    it("can submit with name and content", async () => {
      await setup();

      await act(async () => {
        await userEvent.type(screen.getByLabelText(LABEL.NAME), "My snippet");
        await userEvent.type(
          screen.getByLabelText(LABEL.CONTENT),
          "WHERE discount > 0",
        );
      });

      expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
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

    it("doesn't show the archive button", async () => {
      await setup();
      expect(screen.queryByText("Archive")).not.toBeInTheDocument();
    });
  });

  describe("editing snippet", () => {
    it("shows correct initial state", async () => {
      const snippet = createMockNativeQuerySnippet({
        name: "has name",
        content: "has content",
        description: "has description",
      });
      await setupEditing({ snippet });

      expect(screen.getByLabelText(LABEL.NAME)).toBeInTheDocument();
      expect(screen.getByLabelText(LABEL.NAME)).toHaveValue(snippet.name);

      expect(screen.getByLabelText(LABEL.DESCRIPTION)).toBeInTheDocument();
      expect(screen.getByLabelText(LABEL.DESCRIPTION)).toHaveValue(
        snippet.description,
      );

      expect(screen.getByLabelText(LABEL.CONTENT)).toBeInTheDocument();
      expect(screen.getByLabelText(LABEL.CONTENT)).toHaveValue(snippet.content);

      expect(screen.queryByText(LABEL.FOLDER)).not.toBeInTheDocument();

      expect(
        screen.getByRole("button", { name: "Cancel" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    });

    it("shows expected title", async () => {
      const snippet = createMockNativeQuerySnippet();
      await setupEditing({ snippet });
      expect(screen.getByText(`Editing ${snippet.name}`)).toBeInTheDocument();
    });

    it("shows folder picker if there are many folders", async () => {
      xhrMock.get("/api/collection?namespace=snippets", {
        body: JSON.stringify([TOP_SNIPPETS_FOLDER, createMockCollection()]),
      });

      await setupEditing({ withDefaultFoldersList: false });

      expect(screen.getByText(LABEL.FOLDER)).toBeInTheDocument();
      expect(screen.getByText(TOP_SNIPPETS_FOLDER.name)).toBeInTheDocument();
    });

    it("can't submit until changes are made", async () => {
      await setupEditing();
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    });

    it("can't submit if content is empty", async () => {
      await setupEditing();
      await act(async () => {
        await userEvent.clear(screen.getByLabelText(LABEL.NAME));
      });
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    });

    it("can't submit if name is empty", async () => {
      await setupEditing();
      await act(async () => {
        await userEvent.clear(screen.getByLabelText(LABEL.CONTENT));
      });
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    });

    it("can submit with name and content", async () => {
      await setupEditing();

      userEvent.type(screen.getByLabelText(LABEL.NAME), "My snippet");
      userEvent.type(
        screen.getByLabelText(LABEL.CONTENT),
        "WHERE discount > 0",
      );

      expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
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

    it("closes the modal after archiving", async () => {
      const { onClose } = await setupEditing();
      await act(async () => {
        await userEvent.click(screen.getByText("Archive"));
      });
      expect(onClose).toBeCalledTimes(1);
    });
  });
});
