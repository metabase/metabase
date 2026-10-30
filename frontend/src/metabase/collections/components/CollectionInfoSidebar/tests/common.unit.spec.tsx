import userEvent from "@testing-library/user-event";

import { screen, waitFor } from "__support__/ui";
import type { Collection, CollectionItem } from "metabase-types/api";

import {
  type SetupOpts,
  setup as baseSetup,
  officialCollection,
  regularCollection,
} from "./setup";

const setup = ({
  collection,
  ...opts
}: { collection: Collection } & Partial<SetupOpts>) =>
  baseSetup({
    collection,
    enableEnterprisePlugins: false,
    enableOfficialCollections: false,
    ...opts,
  });

const describeCountButton = (button: HTMLElement) =>
  `${button.getAttribute("aria-label")}: ${button.textContent}`;

describe("CollectionInfoSidebar (OSS)", () => {
  it("should render for a regular collection", async () => {
    setup({
      collection: regularCollection,
    });
    expect(await screen.findByText("Normal collection")).toBeInTheDocument();
    expect(
      await screen.findByText("Description of a normal collection"),
    ).toBeInTheDocument();

    // Official collections are hidden without the official_collections feature
    expect(screen.queryByText("Official collection")).not.toBeInTheDocument();

    // Entity ids are hidden without the serialization feature
    expect(
      screen.queryByText("entity_id_of_normal_collection"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Entity ID info")).not.toBeInTheDocument();
  });

  describe("contents", () => {
    it("counts the items of each present type, in the type filter's order", async () => {
      setup({ collection: regularCollection });

      const counts = await screen.findAllByRole("button", {
        name: /Show only/,
      });
      expect(counts.map(describeCountButton)).toEqual([
        "Show only Collections: 1",
        "Show only Dashboards: 2",
        "Show only Questions: 1",
      ]);
      expect(screen.queryByText("Models")).not.toBeInTheDocument();
    });

    it("filters the items list to a type and closes when a count is clicked", async () => {
      const { onFilterByType, onClose } = setup({
        collection: regularCollection,
      });

      await userEvent.click(
        await screen.findByRole("button", { name: "Show only Dashboards" }),
      );

      expect(onFilterByType).toHaveBeenCalledTimes(1);
      expect(onFilterByType).toHaveBeenCalledWith("dashboard");
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    });

    it("shows plain counts when the list cannot be filtered", async () => {
      setup({ collection: regularCollection, withFilterByType: false });

      expect(await screen.findByText("Dashboards")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Show only/ }),
      ).not.toBeInTheDocument();
      expect(screen.getByText("2")).toBeInTheDocument();
    });

    it("shows an empty state for an empty collection", async () => {
      const collectionItems: CollectionItem[] = [];
      setup({ collection: regularCollection, collectionItems });

      expect(
        await screen.findByText("This collection is empty."),
      ).toBeInTheDocument();
    });
  });

  it("should render properly for an official collection", async () => {
    setup({
      collection: officialCollection,
    });
    expect(await screen.findByText("Trusted collection")).toBeInTheDocument();
    expect(
      await screen.findByText("Description of a trusted collection"),
    ).toBeInTheDocument();

    // Official collections are hidden without the official_collections feature
    expect(screen.queryByText("Official collection")).not.toBeInTheDocument();

    // Entity ids are hidden without the serialization feature
    expect(
      screen.queryByText("entity_id_of_trusted_collection"),
    ).not.toBeInTheDocument();
  });

  it("should truncate description if it exceeds 255 characters", async () => {
    setup({
      collection: {
        ...regularCollection,
        description: "Test Description",
      },
    });

    const editableText = screen.getByText("Test Description");
    await userEvent.click(editableText);

    const input = screen.getByDisplayValue("Test Description");
    await userEvent.clear(input);

    const longDescription = "a".repeat(256);
    await userEvent.type(input, longDescription);
    await userEvent.tab();

    expect(input).toHaveValue(longDescription.slice(0, 255));
  });
});
