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
    enableEnterprisePlugins: true,
    enableRemoteSync: true,
    enableSerialization: true,
  });

describe("CollectionInfoSidebar (EE with token)", () => {
  it("should render a regular collection properly", async () => {
    setup({ collection: regularCollection });
    expect(await screen.findByText(regularCollection.name)).toBeInTheDocument();
    expect(
      await screen.findByText("Description of a normal collection"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("official-badge")).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Entity ID info" }),
    );
    expect(await screen.findByText("This collection")).toBeInTheDocument();
    expect(
      screen.getByText("entity_id_of_normal_collection"),
    ).toBeInTheDocument();
  });

  it("should render an official collection properly", async () => {
    setup({
      collection: officialCollection,
    });
    expect(await screen.findByText("Trusted collection")).toBeInTheDocument();
    expect(
      await screen.findByText("Description of a trusted collection"),
    ).toBeInTheDocument();
    expect(await screen.findByTestId("official-badge")).toHaveTextContent(
      "Official",
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Entity ID info" }),
    );
    expect(
      await screen.findByText("entity_id_of_trusted_collection"),
    ).toBeInTheDocument();
  });
});
