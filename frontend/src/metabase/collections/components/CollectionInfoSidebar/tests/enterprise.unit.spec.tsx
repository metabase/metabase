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
    enableEnterprisePlugins: true,
    enableRemoteSync: false,
  });

describe("CollectionInfoSidebar (EE without tokens)", () => {
  it("should render for a regular collection", async () => {
    setup({
      collection: regularCollection,
    });
    expect(await screen.findByText("Normal collection")).toBeInTheDocument();
    expect(
      await screen.findByText("Description of a normal collection"),
    ).toBeInTheDocument();

    expect(screen.queryByTestId("official-badge")).not.toBeInTheDocument();

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

    expect(screen.queryByTestId("official-badge")).not.toBeInTheDocument();

    // Entity ids are hidden without the serialization feature
    expect(
      screen.queryByText("entity_id_of_trusted_collection"),
    ).not.toBeInTheDocument();
  });
});
