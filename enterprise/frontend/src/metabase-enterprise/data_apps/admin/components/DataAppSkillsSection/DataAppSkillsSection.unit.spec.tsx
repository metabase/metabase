import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor } from "__support__/ui";

import { DataAppSkillsSection } from "./DataAppSkillsSection";

const setup = () => {
  renderWithProviders(<DataAppSkillsSection />);
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
  "metabase-data-app-migrate",
];

describe("DataAppSkillsSection", () => {
  it("shows the command in a copy field, one install per line joined with shell continuations", async () => {
    setup();

    const command = await copyCommand();

    // The command is shown in a copy field (textarea) exactly as it is copied.
    expect(screen.getByRole("textbox")).toHaveValue(command);

    // Each install sits on its own line, joined by ` && \` so the pasted
    // command still runs every install.
    const lines = command.split(" && \\\n");
    expect(lines).toHaveLength(DATA_APP_SKILLS.length + 1);
    lines.forEach((line) => expect(line).toMatch(/^npx skills add \S+/));
  });

  it.each(DATA_APP_SKILLS)(
    "installs the %s skill from its v1 folder",
    async (skill) => {
      setup();

      expect(await copyCommand()).toContain(
        `npx skills add metabase/agent-skills/skills/${skill}/v1 \\\n  --skill ${skill}`,
      );
    },
  );

  it("also installs the skill for writing Metabase YAML, in the same copied command", async () => {
    setup();

    expect(await copyCommand()).toContain(
      " && \\\nnpx skills add metabase/agent-skills/skills \\\n  --skill metabase-representation-format",
    );
  });
});
