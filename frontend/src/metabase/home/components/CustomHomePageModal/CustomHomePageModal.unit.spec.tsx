import { renderWithProviders, screen } from "__support__/ui";

import { CustomHomePageModal } from "./CustomHomePageModal";

const setup = ({ ...props } = {}) => {
  const onClose = jest.fn();

  renderWithProviders(
    <CustomHomePageModal onClose={onClose} isOpen={true} {...props} />,
  );
};

describe("custom hompage modal", () => {
  it("should only enable the save button if a dashboard has been selected", () => {
    setup();
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
  });
});
