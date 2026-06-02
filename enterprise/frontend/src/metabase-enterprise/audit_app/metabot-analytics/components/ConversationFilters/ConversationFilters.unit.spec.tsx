import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, within } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";

import { ConversationFilters } from "./ConversationFilters";

function setup({
  retentionDays,
  date = null,
}: {
  retentionDays: number | null;
  date?: string | null;
}) {
  setupEnterprisePlugins();
  renderWithProviders(
    <ConversationFilters
      date={date}
      onDateChange={() => undefined}
      user={null}
      onUserChange={() => undefined}
      group={null}
      onGroupChange={() => undefined}
      groupNoFilterValue="all"
      tenant={null}
      onTenantChange={() => undefined}
      userOptions={[]}
      groupOptions={[]}
      tenantOptions={[]}
      hasTenants={false}
    />,
    {
      storeInitialState: createMockState({
        settings: mockSettings({
          "ai-usage-max-retention-days": retentionDays,
        }),
      }),
    },
  );
}

async function getDropdownLabels() {
  await userEvent.click(screen.getByTestId("conversation-filters-date-select"));
  const dropdown = await screen.findByRole("listbox");
  return within(dropdown)
    .getAllByRole("option")
    .map((el) => el.textContent ?? "");
}

describe("ConversationFilters date dropdown", () => {
  it("hides shortcuts that go past the configured retention window", async () => {
    setup({ retentionDays: 180 });
    const labels = await getDropdownLabels();
    expect(labels).toEqual(
      expect.arrayContaining([
        "Today",
        "Yesterday",
        "Last 7 days",
        "Last 30 days",
        "Previous month",
        "Previous 3 months",
        "Fixed date range…",
        "Relative date range…",
      ]),
    );
    expect(labels).not.toContain("Previous 12 months");
  });

  it("hides every multi-month shortcut when retention is at the 30-day minimum", async () => {
    setup({ retentionDays: 30 });
    const labels = await getDropdownLabels();
    expect(labels).toEqual(
      expect.arrayContaining([
        "Today",
        "Yesterday",
        "Last 7 days",
        "Last 30 days",
        "Fixed date range…",
        "Relative date range…",
      ]),
    );
    expect(labels).not.toContain("Previous month");
    expect(labels).not.toContain("Previous 3 months");
    expect(labels).not.toContain("Previous 12 months");
  });

  it("shows every shortcut when retention is infinite", async () => {
    setup({ retentionDays: null });
    const labels = await getDropdownLabels();
    expect(labels).toEqual(
      expect.arrayContaining([
        "Today",
        "Yesterday",
        "Last 7 days",
        "Last 30 days",
        "Previous month",
        "Previous 3 months",
        "Previous 12 months",
        "Fixed date range…",
        "Relative date range…",
      ]),
    );
  });

  it("renders the human-readable label for a custom date range value", () => {
    setup({
      retentionDays: 180,
      date: "2026-01-02~2026-03-15",
    });
    const input = screen.getByTestId(
      "conversation-filters-date-select",
    ) as HTMLInputElement;
    expect(input.value).toMatch(/January 2, 2026.*March 15, 2026/);
    expect(input.title).toMatch(/January 2, 2026.*March 15, 2026/);
  });

  it("highlights the Fixed date range option when a custom range is active", async () => {
    setup({
      retentionDays: 180,
      date: "2026-01-02~2026-03-15",
    });
    await userEvent.click(
      screen.getByTestId("conversation-filters-date-select"),
    );
    const dropdown = await screen.findByRole("listbox");
    const fixedOption = within(dropdown).getByRole("option", {
      name: /Fixed date range/,
    });
    expect(fixedOption).toHaveAttribute("aria-selected", "true");
  });

  it("highlights the relative date range option with a custom relative range value", async () => {
    setup({ retentionDays: 180, date: "past5days~" });
    await userEvent.click(
      screen.getByTestId("conversation-filters-date-select"),
    );
    const dropdown = await screen.findByRole("listbox");
    const relativeOption = within(dropdown).getByRole("option", {
      name: /Relative date range/,
    });
    expect(relativeOption).toHaveAttribute("aria-selected", "true");
  });

  it("reuses the current specific range when reopening the fixed picker", async () => {
    setup({ retentionDays: 180, date: "2026-01-02~2026-03-15" });
    await userEvent.click(
      screen.getByTestId("conversation-filters-date-select"),
    );
    await userEvent.click(
      await screen.findByRole("option", { name: /Fixed date range/ }),
    );
    expect(await screen.findByLabelText("Start date")).toHaveValue(
      "January 2, 2026",
    );
    expect(screen.getByLabelText("End date")).toHaveValue("March 15, 2026");
  });
});
