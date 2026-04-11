import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor } from "__support__/ui";

import { LinkTargetControl } from "./LinkTargetControl";

const urlClickBehavior = {
  type: "link" as const,
  linkType: "url" as const,
  linkTemplate: "https://example.com/{{x}}",
};

describe("LinkTargetControl", () => {
  it("calls updateSettings with linkTarget when choosing New tab", async () => {
    const user = userEvent.setup();
    const updateSettings = jest.fn();

    renderWithProviders(
      <LinkTargetControl
        clickBehavior={urlClickBehavior}
        updateSettings={updateSettings}
      />,
    );

    await user.click(screen.getByRole("textbox", { name: /open link in/i }));
    await user.click(await screen.findByRole("option", { name: /new tab/i }));

    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith({
        ...urlClickBehavior,
        linkTarget: "_blank",
      });
    });
  });

  it("removes linkTarget when choosing Default after it was set", async () => {
    const user = userEvent.setup();
    const updateSettings = jest.fn();

    renderWithProviders(
      <LinkTargetControl
        clickBehavior={{ ...urlClickBehavior, linkTarget: "_blank" }}
        updateSettings={updateSettings}
      />,
    );

    await user.click(screen.getByRole("textbox", { name: /open link in/i }));
    await user.click(await screen.findByRole("option", { name: /^default$/i }));

    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith(urlClickBehavior);
    });
  });
});
