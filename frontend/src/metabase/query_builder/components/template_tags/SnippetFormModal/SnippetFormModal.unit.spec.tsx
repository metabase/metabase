import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
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
  fetchMock.get(
    { url: "path:/api/collection/root", query: { namespace: "snippets" } },
    TOP_SNIPPETS_FOLDER,
  );

  if (withDefaultFoldersList) {
    fetchMock.get(
      { url: "path:/api/collection", query: { namespace: "snippets" } },
      [TOP_SNIPPETS_FOLDER],
    );
  }

  fetchMock.post("path:/api/native-query-snippet", async url => {
    return createMockNativeQuerySnippet(
      await fetchMock.lastCall(url)?.request?.json(),
    );
  });

  if (snippet.id) {
    fetchMock.put(`path:/api/native-query-snippet/${snippet.id}`, async url => {
      return createMockNativeQuerySnippet(
        await fetchMock.lastCall(url)?.request?.json(),
      );
    });
  }

  renderWithProviders(
    <SnippetFormModal snippet={snippet} onClose={onClose || undefined} />,
  );

  await waitForLoaderToBeRemoved();

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
      fetchMock.get(
        { url: "path:/api/collection", query: { namespace: "snippets" } },
        [TOP_SNIPPETS_FOLDER, createMockCollection()],
      );

      await setup({ withDefaultFoldersList: false });

      expect(screen.getByText(LABEL.FOLDER)).toBeInTheDocument();
      expect(screen.getByText(TOP_SNIPPETS_FOLDER.name)).toBeInTheDocument();
    });

    it("can't submit if content is empty", async () => {
      await setup();
      await userEvent.type(screen.getByLabelText(LABEL.NAME), "My snippet");
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
      });
    });

    it("can't submit if name is empty", async () => {
      await setup();
      await userEvent.type(
        screen.getByLabelText(LABEL.CONTENT),
        "WHERE discount > 0",
      );
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
      });
    });

    it("can submit with name and content", async () => {
      await setup();

      await userEvent.type(screen.getByLabelText(LABEL.NAME), "My snippet");
      await userEvent.type(
        screen.getByLabelText(LABEL.CONTENT),
        "WHERE discount > 0",
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
      });
    });

    it("doesn't show cancel button if onClose props is not set", async () => {
      await setup({ onClose: null });
      expect(
        screen.queryByRole("button", { name: "Cancel" }),
      ).not.toBeInTheDocument();
    });

    it("calls onClose when cancel button is clicked", async () => {
      const { onClose } = await setup();
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      await waitFor(() => {
        expect(onClose).toHaveBeenCalledTimes(1);
      });
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
      fetchMock.get(
        { url: "path:/api/collection", query: { namespace: "snippets" } },
        [TOP_SNIPPETS_FOLDER, createMockCollection()],
      );

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
      await userEvent.clear(screen.getByLabelText(LABEL.NAME));
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
      });
    });

    it("can't submit if name is empty", async () => {
      await setupEditing();
      await userEvent.clear(screen.getByLabelText(LABEL.CONTENT));
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
      });
    });

    it("can submit with name and content", async () => {
      await setupEditing();

      await userEvent.type(screen.getByLabelText(LABEL.NAME), "My snippet");
      await userEvent.type(
        screen.getByLabelText(LABEL.CONTENT),
        "WHERE discount > 0",
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
      });
    });

    it("doesn't show cancel button if onClose props is not set", async () => {
      await setupEditing({ onClose: null });
      expect(
        screen.queryByRole("button", { name: "Cancel" }),
      ).not.toBeInTheDocument();
    });

    it("calls onClose when cancel button is clicked", async () => {
      const { onClose } = await setupEditing();
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      await waitFor(() => {
        expect(onClose).toHaveBeenCalledTimes(1);
      });
    });

    it("closes the modal after archiving", async () => {
      const { onClose } = await setupEditing();
      await userEvent.click(screen.getByText("Archive"));
      await waitFor(() => {
        expect(onClose).toHaveBeenCalledTimes(1);
      });
    });
  });
});
