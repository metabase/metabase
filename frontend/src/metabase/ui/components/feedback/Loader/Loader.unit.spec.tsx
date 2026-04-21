import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";

import { Loader, setCustomLoader } from "./Loader";

const renderWithProvider = (component: React.ReactElement) => {
  return render(<MantineProvider>{component}</MantineProvider>);
};

describe("Loader", () => {
  beforeEach(() => {
    setCustomLoader(undefined);
  });

  it("renders default Mantine Loader when no custom loader is set", () => {
    renderWithProvider(<Loader data-testid="loader" />);

    const loader = screen.getByTestId("loader");
    expect(loader).toBeInTheDocument();
    expect(loader).toHaveClass("mantine-Loader-root");
  });

  it("renders custom loader when one is set", () => {
    const CustomLoader = () => (
      <div data-testid="custom-loader">Custom Loader</div>
    );

    setCustomLoader(CustomLoader);
    renderWithProvider(<Loader />);

    expect(screen.getByTestId("custom-loader")).toBeInTheDocument();
    expect(screen.queryByTestId("loader")).not.toBeInTheDocument();
  });

  it("switches back to default loader when custom loader is cleared", () => {
    const CustomLoader = () => (
      <div data-testid="custom-loader">Custom Loader</div>
    );

    setCustomLoader(CustomLoader);
    const { rerender } = renderWithProvider(<Loader data-testid="loader" />);
    expect(screen.getByTestId("custom-loader")).toBeInTheDocument();

    setCustomLoader(undefined);
    rerender(
      <MantineProvider>
        <Loader data-testid="loader" />
      </MantineProvider>,
    );

    expect(screen.queryByTestId("custom-loader")).not.toBeInTheDocument();
    expect(screen.getByTestId("loader")).toBeInTheDocument();
  });
});
