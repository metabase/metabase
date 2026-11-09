import userEvent from "@testing-library/user-event";
import fetchMock, { type RouteResponse } from "fetch-mock";

import {
  setupDeleteTransformsFolderEndpoint,
  setupListTransformsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { Transform } from "metabase-types/api";
import {
  createMockCollection,
  createMockTransform,
  createMockTransformTarget,
} from "metabase-types/api/mocks";

import { DeleteTransformsFolderModal } from "./DeleteTransformsFolderModal";
import type { CollectionNode } from "./types";

const COLLECTION = createMockCollection({
  id: 7,
  name: "Folder",
  namespace: "transforms",
});

const FOLDER: CollectionNode = {
  id: "collection-7",
  name: COLLECTION.name,
  nodeType: "folder",
  icon: "folder",
  collection: COLLECTION,
};

const TRANSFORMS: Transform[] = [
  createMockTransform({
    id: 1,
    name: "Orders by day",
    collection_id: COLLECTION.id,
    can_write: true,
    target: createMockTransformTarget({
      name: "orders_by_day",
      schema: "public",
    }),
  }),
  createMockTransform({
    id: 2,
    name: "Products by category",
    collection_id: COLLECTION.id,
    can_write: true,
    target: createMockTransformTarget({ name: "products_by_category" }),
  }),
];

type SetupOpts = {
  transforms?: Transform[];
  response?: RouteResponse;
};

async function setup({ transforms = [], response = 204 }: SetupOpts = {}) {
  setupListTransformsEndpoint(transforms);
  setupDeleteTransformsFolderEndpoint(COLLECTION.id, response);
  const onClose = jest.fn<void, []>();

  renderWithProviders(
    <DeleteTransformsFolderModal folder={FOLDER} onClose={onClose} />,
    { withUndos: true },
  );
  // the dialog reads the transforms list; wait until it has loaded
  await waitFor(() =>
    expect(
      fetchMock.callHistory.calls("path:/api/transform", { method: "GET" }),
    ).toHaveLength(1),
  );
  if (transforms.length > 0) {
    await screen.findByText(/This will delete the folder, its subfolders/);
  }

  return { onClose };
}

const lastDeleteCall = () =>
  fetchMock.callHistory.lastCall(
    `path:/api/transform/collection/${COLLECTION.id}`,
    {
      method: "DELETE",
    },
  );

describe("DeleteTransformsFolderModal", () => {
  it("lists the transforms in the folder and keeps their tables by default", async () => {
    const { onClose } = await setup({ transforms: TRANSFORMS });

    expect(screen.getByText('Delete "Folder"?')).toBeInTheDocument();
    expect(
      screen.getByText(
        "This will delete the folder, its subfolders and the 2 transforms inside it.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Delete the transforms only" }),
    ).toBeChecked();
    expect(
      screen.getByText("Queries that use these tables will break."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("These transforms will be deleted:"),
    ).toBeInTheDocument();
    expect(screen.getByText("Orders by day")).toBeInTheDocument();
    expect(screen.getByText("Products by category")).toBeInTheDocument();
    expect(
      screen.queryByText("(public.orders_by_day)"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("This can’t be undone.")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Delete transforms only" }),
    );

    await waitFor(() => expect(lastDeleteCall()).toBeDefined());
    expect(lastDeleteCall()?.url).not.toContain("delete-tables");
    expect(
      await screen.findByText('Deleted "Folder" and 2 transforms'),
    ).toBeInTheDocument();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("names the target table of every transform when the user chooses to delete the tables too", async () => {
    const { onClose } = await setup({ transforms: TRANSFORMS });

    await userEvent.click(
      screen.getByRole("radio", {
        name: "Delete the transforms and their tables",
      }),
    );

    expect(
      screen.getByText("These transforms and tables will be deleted:"),
    ).toBeInTheDocument();
    expect(screen.getByText("(public.orders_by_day)")).toBeInTheDocument();
    expect(screen.getByText("(products_by_category)")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Delete transforms and tables" }),
    );

    await waitFor(() => expect(lastDeleteCall()).toBeDefined());
    expect(lastDeleteCall()?.url).toContain("delete-tables=true");
    expect(
      await screen.findByText(
        'Deleted "Folder", 2 transforms and their tables',
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("offers no table choice for a folder without transforms", async () => {
    const { onClose } = await setup();

    expect(
      screen.getByText(
        "This will delete the folder and its subfolders. This can’t be undone.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Delete folder" }),
    );

    await waitFor(() => expect(lastDeleteCall()).toBeDefined());
    expect(await screen.findByText('Deleted "Folder"')).toBeInTheDocument();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("closes without a request on cancel", async () => {
    const { onClose } = await setup({ transforms: TRANSFORMS });

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(lastDeleteCall()).toBeUndefined();
  });

  it("explains a 403 in the dialog and stays open", async () => {
    const { onClose } = await setup({
      transforms: TRANSFORMS,
      response: {
        status: 403,
        body: "You don't have permissions to do that.",
      },
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Delete transforms only" }),
    );

    expect(
      await screen.findByText(
        'You can’t delete "Folder": it holds a transform you can’t edit, or whose type is not enabled on this instance.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Deleted "Folder"/)).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows the server's message in the dialog when a table cannot be dropped", async () => {
    const { onClose } = await setup({
      transforms: TRANSFORMS,
      response: {
        status: 500,
        body: "cannot drop table public.orders_by_day because other objects depend on it",
      },
    });

    await userEvent.click(
      screen.getByRole("radio", {
        name: "Delete the transforms and their tables",
      }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Delete transforms and tables" }),
    );

    expect(
      await screen.findByText(
        "cannot drop table public.orders_by_day because other objects depend on it",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("falls back to a generic message when the failure has none", async () => {
    const { onClose } = await setup({
      transforms: TRANSFORMS,
      response: { status: 500, body: {} },
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Delete transforms only" }),
    );

    expect(
      await screen.findByText('"Folder" could not be deleted'),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
