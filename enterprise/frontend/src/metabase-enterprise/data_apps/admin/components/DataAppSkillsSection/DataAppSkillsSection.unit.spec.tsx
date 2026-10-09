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

describe("DataAppSkillsSection", () => {
  it("shows the command in a copy field exactly as it is copied", async () => {
    setup();

    const command = await copyCommand();

    expect(screen.getByRole("textbox")).toHaveValue(command);
  });

  it("installs the data apps skill from its v1 folder, naming it because it's internal", async () => {
    setup();

    expect(await copyCommand()).toBe(
      "npx skills add metabase/agent-skills/skills/metabase-data-apps/v1 \\\n  --skill metabase-data-apps",
    );
  });
});
