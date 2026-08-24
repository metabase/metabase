import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor } from "__support__/ui";

import { CollapsibleSettingsSection } from "./SettingsSection";

const setup = ({ defaultOpened }: { defaultOpened?: boolean } = {}) => {
  renderWithProviders(
    <CollapsibleSettingsSection
      title="Section title"
      description="Section description"
      defaultOpened={defaultOpened}
    >
      <div>Section content</div>
    </CollapsibleSettingsSection>,
  );
};

describe("CollapsibleSettingsSection", () => {
  it("shows the title and description while collapsed", () => {
    setup();

    expect(screen.getByText("Section title")).toBeInTheDocument();
    expect(screen.getByText("Section description")).toBeInTheDocument();
    expect(screen.getByText("Section content")).not.toBeVisible();
    expect(
      screen.getByRole("button", { name: /Section title/ }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("exposes the title as a heading and keeps the chevron out of the accessible name", () => {
    setup();

    expect(
      screen.getByRole("heading", { name: "Section title" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Section title" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("expands and collapses on header click", async () => {
    setup();
    const header = screen.getByRole("button", { name: /Section title/ });

    await userEvent.click(header);
    await waitFor(() =>
      expect(screen.getByText("Section content")).toBeVisible(),
    );
    expect(header).toHaveAttribute("aria-expanded", "true");

    // jsdom never completes the closing transition, so assert state via aria
    await userEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "false");
  });

  it("can start expanded via defaultOpened", () => {
    setup({ defaultOpened: true });

    expect(screen.getByText("Section content")).toBeVisible();
  });
});
