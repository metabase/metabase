import { assocIn } from "icepick";

import { screen } from "__support__/ui";
import type { MetabotState } from "metabase/metabot/state";
import { getMetabotInitialState } from "metabase/metabot/state/reducer-utils";
import { setup } from "metabase/metabot/tests/utils";

import { MetabotChatInput } from "./MetabotChatInput";

const makeState = (isProcessing: boolean): MetabotState =>
  assocIn(
    assocIn(
      getMetabotInitialState(),
      ["conversations", "omnibot", "visible"],
      true,
    ),
    ["conversations", "omnibot", "isProcessing"],
    isProcessing,
  );

describe("MetabotChatInput", () => {
  it("keeps the input read-only (not disabled) while the agent is processing, so it stays focusable and does not scroll out of the viewport (metabase#67399)", () => {
    setup({
      ui: <MetabotChatInput />,
      metabotInitialState: makeState(true),
    });

    const input = screen.getByPlaceholderText("Doing science...");
    expect(input).toHaveAttribute("readonly");
    expect(input).toBeEnabled();
  });

  it("leaves the input editable when the agent is idle", () => {
    setup({
      ui: <MetabotChatInput />,
      metabotInitialState: makeState(false),
    });

    const input = screen.getByPlaceholderText("Ask AI a question...");
    expect(input).not.toHaveAttribute("readonly");
    expect(input).toBeEnabled();
  });
});
