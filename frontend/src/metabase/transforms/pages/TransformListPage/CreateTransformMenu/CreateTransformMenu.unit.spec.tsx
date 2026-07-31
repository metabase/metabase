import userEvent from "@testing-library/user-event";

import { mockSettings } from "__support__/settings";
import { screen } from "__support__/ui";
import { Metabot } from "metabase/metabot/components/Metabot";
import { getMetabotInitialState } from "metabase/metabot/state/reducer-utils";
import {
  assertVisible as assertMetabotVisible,
  input as metabotInput,
  setup as setupMetabot,
} from "metabase/metabot/tests/utils";

import { CreateTransformMenu } from "./CreateTransformMenu";

function setup({
  isMetabotEnabled = true,
  worktreeId,
}: {
  isMetabotEnabled?: boolean;
  worktreeId?: number;
} = {}) {
  return setupMetabot({
    ui: (
      <>
        <CreateTransformMenu worktreeId={worktreeId} />
        <Metabot />
      </>
    ),
    metabotInitialState: getMetabotInitialState(),
    storeInitialState: {
      settings: mockSettings({
        "metabot-enabled?": isMetabotEnabled,
        "llm-metabot-configured?": true,
      }),
    },
  });
}

async function openMenu() {
  await userEvent.click(
    await screen.findByRole("button", { name: "Create a transform" }),
  );
}

describe("CreateTransformMenu", () => {
  it("shows the Metabot item as the first option when Metabot is available", async () => {
    setup({ isMetabotEnabled: true });
    await openMenu();

    const items = await screen.findAllByRole("menuitem");
    expect(items[0]).toHaveTextContent("Metabot");
  });

  it("hides the Metabot item when Metabot is disabled", async () => {
    setup({ isMetabotEnabled: false });
    await openMenu();

    expect(await screen.findByText("SQL query")).toBeInTheDocument();
    expect(screen.queryByText("Metabot")).not.toBeInTheDocument();
  });

  it("opens Metabot with a pre-seeded prompt when the Metabot item is clicked", async () => {
    setup({ isMetabotEnabled: true });
    await openMenu();

    await userEvent.click(await screen.findByText("Metabot"));

    await assertMetabotVisible();
    expect(await metabotInput()).toHaveTextContent("Create a transform that");
  });

  it("offers only in-worktree creation options in a worktree view", async () => {
    setup({ isMetabotEnabled: true, worktreeId: 7 });
    await openMenu();

    expect(await screen.findByText("Query builder")).toBeInTheDocument();
    expect(screen.getByText("SQL query")).toBeInTheDocument();
    expect(screen.getByText("Copy of a saved question")).toBeInTheDocument();
    // Metabot and transform folders create main-app content.
    expect(screen.queryByText("Metabot")).not.toBeInTheDocument();
    expect(screen.queryByText("Transform folder")).not.toBeInTheDocument();
  });
});
