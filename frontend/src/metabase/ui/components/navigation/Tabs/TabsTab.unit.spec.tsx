import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "__support__/ui";

import { Tabs } from "./Tabs";
import type { TabsTabProps } from "./TabsTab";

function setup(props: Partial<TabsTabProps> = {}) {
  const onChange = jest.fn();
  const onClose = jest.fn();

  renderWithProviders(
    <Tabs value="one" onChange={onChange}>
      <Tabs.List>
        <Tabs.Tab value="one" onClose={onClose} {...props}>
          One
        </Tabs.Tab>
        <Tabs.Tab value="two">Two</Tabs.Tab>
      </Tabs.List>
    </Tabs>,
  );

  return { onChange, onClose, tab: screen.getByRole("tab", { name: /One/ }) };
}

describe("Tabs.Tab", () => {
  it("renders no close control by default", () => {
    const { tab } = setup();

    expect(within(tab).queryByTestId("tab-close")).not.toBeInTheDocument();
    expect(tab).not.toHaveAttribute("data-closable");
  });

  describe("closable", () => {
    it("marks the tab and renders the close control after the right section", () => {
      const { tab } = setup({ closable: true, rightSection: "right" });

      expect(tab).toHaveAttribute("data-closable", "true");
      expect(tab).toHaveTextContent(/right$/);
      expect(within(tab).getByTestId("tab-close")).toBeInTheDocument();
    });

    it("does not nest an interactive element inside the tab", () => {
      const { tab } = setup({ closable: true });

      expect(within(tab).queryByRole("button")).not.toBeInTheDocument();
    });

    it("calls onClose with the tab value on click without selecting the tab", async () => {
      const { tab, onChange, onClose } = setup({ closable: true });

      await userEvent.click(within(tab).getByTestId("tab-close"));

      expect(onClose).toHaveBeenCalledWith("one");
      expect(onChange).not.toHaveBeenCalled();
    });

    it.each(["{Delete}", "{Backspace}"])(
      "calls onClose when %s is pressed on the focused tab",
      async (key) => {
        const { tab, onClose } = setup({ closable: true });

        tab.focus();
        await userEvent.keyboard(key);

        expect(onClose).toHaveBeenCalledWith("one");
      },
    );

    it("keeps the caller's onKeyDown and does not close when not closable", async () => {
      const onKeyDown = jest.fn();
      const { tab, onClose } = setup({ onKeyDown });

      tab.focus();
      await userEvent.keyboard("{Delete}");

      expect(onKeyDown).toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
