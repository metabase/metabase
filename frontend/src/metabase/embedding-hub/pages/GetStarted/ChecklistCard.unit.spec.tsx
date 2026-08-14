import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { ChecklistCard } from "./ChecklistCard";

describe("ChecklistCard", () => {
  it("names the prerequisite when locked", async () => {
    renderWithProviders(
      <ChecklistCard
        step={6}
        icon="embed"
        title="Embed in production with SSO"
        description="Embed a dashboard, question, the query builder or the collection browser."
        isLocked
        lockedReason="Set up SSO to unlock"
      />,
    );

    await userEvent.hover(screen.getByText("Embed in production with SSO"));

    // The tooltip names the actual prerequisite, not a generic "complete the
    // other steps".
    expect(await screen.findByText(/Set up SSO to unlock/)).toBeInTheDocument();
  });

  it("does not offer a tooltip once unlocked", async () => {
    renderWithProviders(
      <ChecklistCard
        step={6}
        icon="embed"
        title="Embed in production with SSO"
        description="Embed a dashboard, question, the query builder or the collection browser."
        onClick={jest.fn()}
      />,
    );

    await userEvent.hover(screen.getByText("Embed in production with SSO"));

    expect(screen.queryByText(/Set up SSO to unlock/)).not.toBeInTheDocument();
  });

  it("does not fire its action while locked", async () => {
    const onClick = jest.fn();

    renderWithProviders(
      <ChecklistCard
        step={6}
        icon="embed"
        title="Embed in production with SSO"
        description="Embed a dashboard."
        isLocked
        lockedReason="Set up SSO to unlock"
        onClick={onClick}
      />,
    );

    await userEvent.click(screen.getByText("Embed in production with SSO"));

    expect(onClick).not.toHaveBeenCalled();
  });
});
