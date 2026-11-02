import userEvent from "@testing-library/user-event";
import fetchMock, { type RouteResponse } from "fetch-mock";

import { setupDeleteTransformsFolderEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockCollection } from "metabase-types/api/mocks";

import { DeleteTransformsFolderModal } from "./DeleteTransformsFolderModal";
import type { FolderTransform } from "./types";

const COLLECTION = createMockCollection({
  id: 7,
  name: "Folder",
  namespace: "transforms",
});

const TRANSFORMS: FolderTransform[] = [
  {
    id: 1,
    name: "Orders by day",
    can_write: true,
    target: {
      type: "table",
      name: "orders_by_day",
      schema: "public",
      database: 1,
    },
  },
  {
    id: 2,
    name: "Products by category",
    can_write: true,
    target: {
      type: "table",
      name: "products_by_category",
      schema: null,
      database: 1,
    },
  },
];

type SetupOpts = {
  transforms?: FolderTransform[];
  response?: RouteResponse;
};

function setup({ transforms = [], response = 204 }: SetupOpts = {}) {
  setupDeleteTransformsFolderEndpoint(COLLECTION.id, response);
  const onClose = jest.fn<void, []>();

  renderWithProviders(
    <DeleteTransformsFolderModal
      collection={COLLECTION}
      transforms={transforms}
      onClose={onClose}
    />,
    { withUndos: true },
  );

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
    const { onClose } = setup({ transforms: TRANSFORMS });

    expect(screen.getByText('Delete "Folder"?')).toBeInTheDocument();
    expect(
      screen.getByText("This will also delete the 2 transforms inside it:"),
    ).toBeInTheDocument();
    expect(screen.getByText("Orders by day")).toBeInTheDocument();
    expect(screen.getByText("(public.orders_by_day)")).toBeInTheDocument();
    expect(screen.getByText("Products by category")).toBeInTheDocument();
    expect(screen.getByText("(products_by_category)")).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Delete the transforms only" }),
    ).toBeChecked();

    await userEvent.click(
      screen.getByRole("button", { name: "Delete transforms only" }),
    );

    await waitFor(() => expect(lastDeleteCall()).toBeDefined());
    expect(lastDeleteCall()?.url).not.toContain("delete-tables");
    expect(
      await screen.findByText('"Folder" has been deleted'),
    ).toBeInTheDocument();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("sends delete-tables=true when the user chooses to delete the tables too", async () => {
    const { onClose } = setup({ transforms: TRANSFORMS });

    await userEvent.click(
      screen.getByRole("radio", {
        name: "Delete the transforms and their tables",
      }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Delete transforms and tables" }),
    );

    await waitFor(() => expect(lastDeleteCall()).toBeDefined());
    expect(lastDeleteCall()?.url).toContain("delete-tables=true");
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("offers no table choice for a folder without transforms", async () => {
    const { onClose } = setup();

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
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("closes without a request on cancel", async () => {
    const { onClose } = setup({ transforms: TRANSFORMS });

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(lastDeleteCall()).toBeUndefined();
  });

  it("explains a 403 in an error toast and closes", async () => {
    const { onClose } = setup({
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
    expect(
      screen.queryByText('"Folder" has been deleted'),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("reports any other failure in an error toast and closes", async () => {
    const { onClose } = setup({
      transforms: TRANSFORMS,
      response: { status: 500, body: "Something went wrong" },
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Delete transforms only" }),
    );

    expect(
      await screen.findByText('"Folder" could not be deleted'),
    ).toBeInTheDocument();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
