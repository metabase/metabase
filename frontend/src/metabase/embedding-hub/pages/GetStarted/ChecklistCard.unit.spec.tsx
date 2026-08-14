import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { ChecklistCard } from "./ChecklistCard";

describe("ChecklistCard", () => {
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
