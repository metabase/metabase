import userEvent from "@testing-library/user-event";

import { mockSettings } from "__support__/settings";
import { screen } from "__support__/ui";
import { WorktreeProvider } from "metabase/common/worktrees";
import { Metabot } from "metabase/metabot/components/Metabot";
import { getMetabotInitialState } from "metabase/metabot/state/reducer-utils";
import {
  assertVisible as assertMetabotVisible,
  input as metabotInput,
  setup as setupMetabot,
} from "metabase/metabot/tests/utils";
import type { WorktreeId } from "metabase-types/api";

import { CreateTransformMenu } from "./CreateTransformMenu";

function setup({
  isMetabotEnabled = true,
  worktreeId,
}: { isMetabotEnabled?: boolean; worktreeId?: WorktreeId } = {}) {
  const menu =
    worktreeId != null ? (
      <WorktreeProvider worktreeId={worktreeId}>
        <CreateTransformMenu />
      </WorktreeProvider>
    ) : (
      <CreateTransformMenu />
    );

  return setupMetabot({
    ui: (
      <>
        {menu}
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

  it("shows the saved question item outside a worktree", async () => {
    setup();
    await openMenu();

    expect(
      await screen.findByText("Copy of a saved question"),
    ).toBeInTheDocument();
  });

  it("hides the saved question item inside a worktree", async () => {
    setup({ worktreeId: 7 });
    await openMenu();

    expect(await screen.findByText("SQL query")).toBeInTheDocument();
    expect(
      screen.queryByText("Copy of a saved question"),
    ).not.toBeInTheDocument();
  });
});
