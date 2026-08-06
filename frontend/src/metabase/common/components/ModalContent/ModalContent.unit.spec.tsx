import userEvent from "@testing-library/user-event";

import { getIcon, render, screen } from "__support__/ui";

import type { ModalContentProps } from "./ModalContent";
import { ModalContent } from "./ModalContent";
import { ModalContentActionIcon } from "./ModalHeader";

describe("ModalContent", () => {
  it("should render header action buttons", async () => {
    const headerActions = [
      {
        icon: "pencil" as const,
        onClick: jest.fn(),
      },
      {
        icon: "bolt" as const,
        onClick: jest.fn(),
      },
    ];

    const headerActionsEl = (
      <>
        {headerActions.map(({ icon, onClick }) => (
          <ModalContentActionIcon key={icon} name={icon} onClick={onClick} />
        ))}
      </>
    );

    setup({ headerActions: headerActionsEl });

    for (const { icon, onClick } of headerActions) {
      const iconEl = getIcon(icon);
      expect(iconEl).toBeInTheDocument();

      await userEvent.click(iconEl);

      expect(onClick).toHaveBeenCalledTimes(1);
    }
  });

  it("should render back button if onBack props is passed", async () => {
    const onBack = jest.fn();

    setup({ onBack });

    const backButton = screen.getByRole("button", { name: "Back" });
    expect(backButton).toBeInTheDocument();

    await userEvent.click(backButton);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("should activate the back button with the keyboard", async () => {
    const onBack = jest.fn();

    setup({ onBack });

    screen.getByRole("button", { name: "Back" }).focus();

    await userEvent.keyboard("{Enter}");
    expect(onBack).toHaveBeenCalledTimes(1);

    await userEvent.keyboard(" ");
    expect(onBack).toHaveBeenCalledTimes(2);
  });

  it("should go back when the title is clicked", async () => {
    const onBack = jest.fn();

    setup({ onBack });

    await userEvent.click(screen.getByText(/Long Modal title/));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

function setup({
  id = "id",
  title = "Long Modal title Long Modal title Long Modal title",
  centeredTitle = false,
  children = <>Content</>,
  fullPageModal = false,
  onClose = jest.fn(),
  onBack,
  ...extraProps
}: Partial<ModalContentProps> = {}) {
  const props = {
    id,
    title,
    centeredTitle,
    children,
    fullPageModal,
    onClose,
    onBack,
    ...extraProps,
  };

  render(<ModalContent {...props} />);
}
