import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
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
  if (folder.id) {
    fetchMock.get(
      {
        url: `path:/api/collection/${folder.id}`,
      },
      folder,
    );

    fetchMock.put(`path:/api/collection/${folder.id}`, async url => {
      return createMockCollection(
        await fetchMock.lastCall(url)?.request?.json(),
      );
    });
  }

  fetchMock.get(
    { url: "path:/api/collection/root", query: { namespace: "snippets" } },
    TOP_SNIPPETS_FOLDER,
  );

  fetchMock.get(
    {
      url: "path:/api/collection",
      query: { namespace: "snippets" },
    },
    [TOP_SNIPPETS_FOLDER],
  );

  fetchMock.post("path:/api/collection", async url => {
    return createMockCollection(await fetchMock.lastCall(url)?.request?.json());
  });

  renderWithProviders(
    <SnippetCollectionFormModal
      collection={folder}
      onClose={onClose || undefined}
    />,
  );

  if (folder.id) {
    await waitForLoaderToBeRemoved();
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

      await userEvent.type(screen.getByLabelText(LABEL.NAME), "My folder");

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Create" })).toBeEnabled();
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
  });

  describe("editing folder", () => {
    it("shows correct initial state", async () => {
      const folder = createMockCollection({ description: "has description" });
      await setupEditing({ folder });

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
      await userEvent.clear(screen.getByLabelText(LABEL.NAME));
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Update" })).toBeDisabled();
      });
    });

    it("can submit when have changes", async () => {
      await setupEditing();
      await userEvent.type(screen.getByLabelText(LABEL.NAME), "My folder");
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Update" })).toBeEnabled();
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
  });
});
