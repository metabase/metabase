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
    enableOfficialCollections: true,
    enableSerialization: true,
  });

describe("CollectionInfoSidebar (EE with token)", () => {
  it("should render a regular collection properly", async () => {
    setup({ collection: regularCollection });
    expect(await screen.findByText(regularCollection.name)).toBeInTheDocument();
    expect(
      await screen.findByText("Description of a normal collection"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("entity_id_of_normal_collection"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Official collection")).not.toBeInTheDocument();
  });

  it("should render an official collection properly", async () => {
    setup({
      collection: officialCollection,
    });
    expect(await screen.findByText("Trusted collection")).toBeInTheDocument();
    expect(
      await screen.findByText("Description of a trusted collection"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("entity_id_of_trusted_collection"),
    ).toBeInTheDocument();
    expect(await screen.findByText("Official collection")).toBeInTheDocument();
  });
});
