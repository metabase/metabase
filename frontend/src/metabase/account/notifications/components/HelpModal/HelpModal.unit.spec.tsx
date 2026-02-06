import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";

import HelpModal from "./HelpModal";

type SetupOpts = {
  onClose?: (confirmed: boolean) => void;
};

function setup({ onClose = jest.fn() }: SetupOpts = {}) {
  renderWithProviders(<HelpModal onClose={onClose} />);
}

describe("HelpModal", () => {
  it("should render with admin email", () => {
    mockSettings({ "admin-email": "admin@example.com" });

    setup();

    const link = screen.getByRole("link");
    expect(link).toHaveProperty("href", "mailto:admin@example.com");
  });

  it("should render without admin email", () => {
    mockSettings({ "admin-email": null });

    setup();

    expect(
      screen.getByText("administrator", { exact: false }),
    ).toBeInTheDocument();
  });

  it("should close on button click", () => {
    const onClose = jest.fn();

    setup({ onClose });

    screen.getByText("Got it").click();
    expect(onClose).toHaveBeenCalled();
  });
});
