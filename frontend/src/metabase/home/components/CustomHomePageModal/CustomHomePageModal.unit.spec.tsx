import { renderWithProviders, screen } from "__support__/ui-with-store";

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
    expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();
  });
});
