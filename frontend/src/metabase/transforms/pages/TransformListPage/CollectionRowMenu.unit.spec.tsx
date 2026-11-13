import userEvent from "@testing-library/user-event";

import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import type { Transform } from "metabase-types/api";
import {
  createMockCollection,
  createMockTransform,
  createMockUser,
} from "metabase-types/api/mocks";

import { CollectionRowMenu } from "./CollectionRowMenu";
import type { CollectionNode, TransformsFolderModalState } from "./types";

const COLLECTION = createMockCollection({
  id: 7,
  name: "Folder",
  namespace: "transforms",
  can_write: true,
});

const FOLDER: CollectionNode = {
  id: "collection-7",
  name: COLLECTION.name,
  nodeType: "folder",
  icon: "folder",
  collection: COLLECTION,
};

const TRANSFORMS: Transform[] = [
  createMockTransform({ id: 1, name: "Orders by day", can_write: true }),
];

type SetupOpts = {
  transforms?: Transform[];
};

function setup({ transforms = TRANSFORMS }: SetupOpts = {}) {
  const onOpenModal = jest.fn<void, [TransformsFolderModalState]>();

  renderWithProviders(
    <CollectionRowMenu
      folder={FOLDER}
      transforms={transforms}
      onOpenModal={onOpenModal}
    />,
    {
      storeInitialState: createMockState({
        settings: mockSettings(),
        currentUser: createMockUser({ is_superuser: true }),
      }),
    },
  );

  return { onOpenModal };
}

async function openMenu() {
  await userEvent.click(
    screen.getByRole("button", { name: "Collection options" }),
  );
  await screen.findByRole("menu");
}

describe("transforms CollectionRowMenu", () => {
  it("offers Delete instead of Archive", async () => {
    setup();
    await openMenu();

    expect(
      screen.getByRole("menuitem", { name: /Delete/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /Archive/ }),
    ).not.toBeInTheDocument();
  });

  it("opens the delete modal with the folder", async () => {
    const { onOpenModal } = setup();
    await openMenu();

    await userEvent.click(screen.getByRole("menuitem", { name: /Delete/ }));

    expect(onOpenModal).toHaveBeenCalledTimes(1);
    expect(onOpenModal).toHaveBeenCalledWith({
      type: "delete",
      folder: FOLDER,
    });
  });

  it("hides Delete when the user cannot edit every transform in the folder", async () => {
    setup({
      transforms: [
        createMockTransform({ id: 1, name: "Orders by day", can_write: true }),
        createMockTransform({
          id: 2,
          name: "Products by category",
          can_write: false,
        }),
      ],
    });
    await openMenu();

    expect(
      screen.getByRole("menuitem", { name: /Edit collection details/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /Delete/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /Archive/ }),
    ).not.toBeInTheDocument();
  });

  it("offers Delete for a folder without transforms", async () => {
    setup({ transforms: [] });
    await openMenu();

    expect(
      screen.getByRole("menuitem", { name: /Delete/ }),
    ).toBeInTheDocument();
  });
});
