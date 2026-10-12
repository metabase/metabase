import { Select as MantineSelect } from "@mantine/core";
import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";

// Mantine's own Select, not ours: our Select sets the marker attribute itself,
// so only Mantine's shows whether the wrapped dropdown reached Mantine's Popover.
describe("register-popover-dropdown", () => {
  it("installs the wrapped dropdown on Mantine's Popover once ThemeProvider mounts", async () => {
    render(<MantineSelect label="Fruit" data={["Apple"]} />);

    await userEvent.click(screen.getByLabelText("Fruit"));

    const option = await screen.findByRole("option", { name: "Apple" });
    // The marker sits on the dropdown around the listbox, which no Testing Library query reaches.
    // eslint-disable-next-line testing-library/no-node-access
    expect(option.closest('[data-element-id="mantine-popover"]')).toBeVisible();
  });
});
