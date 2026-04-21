import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";
import type { Collection } from "metabase-types/api";

import {
  setup as baseSetup,
  officialCollection,
  regularCollection,
} from "./setup";

const setup = ({ collection }: { collection: Collection }) =>
  baseSetup({
    collection,
    enableEnterprisePlugins: false,
    enableOfficialCollections: false,
  });

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
