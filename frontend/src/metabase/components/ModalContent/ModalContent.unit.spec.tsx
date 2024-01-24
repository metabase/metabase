import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/react";
import { getIcon, render } from "__support__/ui";
import { ModalContentActionIcon } from "./ModalContent.styled";
import type { ModalContentProps } from "./ModalContent";
import ModalContent from "./ModalContent";

describe("ModalContent", () => {
  it("should render header action buttons", () => {
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

    headerActions.forEach(({ icon, onClick }) => {
      const iconEl = getIcon(icon);
      expect(iconEl).toBeInTheDocument();

      userEvent.click(iconEl);

      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  it("should render back button if onBack props is passed", () => {
    const onBack = jest.fn();

    setup({ onBack });

    const backButton = screen.getByLabelText("chevronleft icon");
    expect(backButton).toBeInTheDocument();

    userEvent.click(backButton);
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
