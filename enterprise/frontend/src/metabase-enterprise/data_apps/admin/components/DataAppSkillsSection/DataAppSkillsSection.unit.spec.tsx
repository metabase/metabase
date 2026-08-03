import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createMockSettingsState,
  createMockState,
} from "metabase/redux/store/mocks";
import { createMockVersion } from "metabase-types/api/mocks";

import { DataAppSkillsSection } from "./DataAppSkillsSection";

const setup = (tag?: string) => {
  renderWithProviders(<DataAppSkillsSection />, {
    storeInitialState: createMockState({
      settings: createMockSettingsState({
        version: createMockVersion({ tag }),
      }),
    }),
  });
};

const copyCommand = async () => {
  const writeText = jest.fn((_text: string) => Promise.resolve());
  Object.assign(navigator, { clipboard: { writeText } });

  await userEvent.click(screen.getByTestId("copy-button"));

  await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
  return writeText.mock.calls[0][0];
};

const DATA_APP_SKILLS = [
  "metabase-data-app-setup",
  "metabase-data-app-routing",
  "metabase-data-app-actions",
  "metabase-data-app-semantic-layer",
];

describe("DataAppSkillsSection", () => {
  it("shows the command in a copy field, split across lines with shell continuations", async () => {
    setup("v0.64.0");

    const command = await copyCommand();

    // The command is shown in a copy field (textarea) exactly as it is copied.
    expect(screen.getByRole("textbox")).toHaveValue(command);

    // Each --skill sits on its own line, joined by ` \` line-continuations, so
    // the pasted command is still one runnable invocation.
    expect(command).toContain("npx skills add metabase/metabase/skills#");
    expect(command).toContain(" \\\n--skill metabase-data-app-setup");
  });

  it.each(DATA_APP_SKILLS)(
    "includes the %s skill in the copied command",
    async (skill) => {
      setup("v0.64.0");

      expect(await copyCommand()).toContain(`--skill ${skill}`);
    },
  );

  // Release builds pin to their `release-x.<major>.x` branch; local, snapshot,
  // and unknown builds fall back to `master`.
  it.each<[tag: string | undefined, branch: string]>([
    ["v0.64.0", "release-x.64.x"],
    ["vLOCAL_DEV", "master"],
    ["v0.53.0-SNAPSHOT", "master"],
    [undefined, "master"],
  ])("pins the skills for version '%s' to #%s", async (tag, branch) => {
    setup(tag);

    expect(await copyCommand()).toContain(`/skills#${branch}`);
  });
});
