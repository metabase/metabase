import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { AreaNavbarHeader } from "./AreaNavbarHeader";

interface SetupOpts {
  isNavbarOpened?: boolean;
  title?: string;
}

const setup = ({ isNavbarOpened = true, title }: SetupOpts = {}) => {
  const onNavbarToggle = jest.fn();

  renderWithProviders(
    <AreaNavbarHeader
      logo={<div>{"Logo"}</div>}
      title={title}
      headerControls={<div>{"Header controls"}</div>}
      isNavbarOpened={isNavbarOpened}
      onNavbarToggle={onNavbarToggle}
    />,
  );

  return { onNavbarToggle };
};

describe("AreaNavbarHeader", () => {
  it("renders the logo", () => {
    setup();

    expect(screen.getByText("Logo")).toBeInTheDocument();
  });

  it("renders the title when the navbar is open", () => {
    setup({ isNavbarOpened: true, title: "Embedding hub" });

    expect(screen.getByText("Embedding hub")).toBeInTheDocument();
  });

  it("hides the title when the navbar is closed, leaving room for the logo alone", () => {
    setup({ isNavbarOpened: false, title: "Embedding hub" });

    expect(screen.queryByText("Embedding hub")).not.toBeInTheDocument();
  });

  it("renders header controls when the navbar is open", () => {
    setup({ isNavbarOpened: true });

    expect(screen.getByText("Header controls")).toBeInTheDocument();
  });

  it("does not render header controls when the navbar is closed", () => {
    setup({ isNavbarOpened: false });

    expect(screen.queryByText("Header controls")).not.toBeInTheDocument();
  });

  it("toggles an open navbar closed", async () => {
    const { onNavbarToggle } = setup({ isNavbarOpened: true });

    await userEvent.click(
      screen.getByRole("button", { name: /close sidebar/i }),
    );

    expect(onNavbarToggle).toHaveBeenCalledWith(false);
  });

  it("toggles a closed navbar open", async () => {
    const { onNavbarToggle } = setup({ isNavbarOpened: false });

    await userEvent.click(
      screen.getByRole("button", { name: /open sidebar/i }),
    );

    expect(onNavbarToggle).toHaveBeenCalledWith(true);
  });
});
