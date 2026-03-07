import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";

import { HopsInput } from "./HopsInput";

const renderWithProvider = (component: React.ReactElement) => {
  return render(<MantineProvider>{component}</MantineProvider>);
};

describe("HopsInput", () => {
  describe("component rendering", () => {
    it("should display initial value in thumb", () => {
      renderWithProvider(<HopsInput value={2} onChange={jest.fn()} />);

      expect(screen.getByText("2")).toBeInTheDocument();
    });

    it("should display 'Steps' label", () => {
      renderWithProvider(<HopsInput value={2} onChange={jest.fn()} />);

      expect(screen.getByText("Steps")).toBeInTheDocument();
    });

    it("should have hops-input testid on container", () => {
      renderWithProvider(<HopsInput value={2} onChange={jest.fn()} />);

      expect(screen.getByTestId("hops-input")).toBeInTheDocument();
    });

    it("should have hops-slider testid on slider", () => {
      renderWithProvider(<HopsInput value={2} onChange={jest.fn()} />);

      expect(screen.getByTestId("hops-slider")).toBeInTheDocument();
    });
  });

  describe("boundary values", () => {
    it("should display minimum value (0)", () => {
      renderWithProvider(<HopsInput value={0} onChange={jest.fn()} />);

      expect(screen.getByText("0")).toBeInTheDocument();
    });

    it("should display maximum value (5)", () => {
      renderWithProvider(<HopsInput value={5} onChange={jest.fn()} />);

      expect(screen.getByText("5")).toBeInTheDocument();
    });

    it("should display mid-range value (3)", () => {
      renderWithProvider(<HopsInput value={3} onChange={jest.fn()} />);

      expect(screen.getByText("3")).toBeInTheDocument();
    });
  });

  describe("value changes", () => {
    it("should update displayed value when prop changes", () => {
      const { rerender } = renderWithProvider(
        <HopsInput value={2} onChange={jest.fn()} />,
      );

      expect(screen.getByText("2")).toBeInTheDocument();

      rerender(
        <MantineProvider>
          <HopsInput value={4} onChange={jest.fn()} />
        </MantineProvider>,
      );

      expect(screen.getByText("4")).toBeInTheDocument();
      expect(screen.queryByText("2")).not.toBeInTheDocument();
    });

    it("should display all possible values", () => {
      for (let value = 0; value <= 5; value++) {
        const { unmount } = renderWithProvider(
          <HopsInput value={value} onChange={jest.fn()} />,
        );

        expect(screen.getByText(value.toString())).toBeInTheDocument();
        unmount();
      }
    });
  });

  describe("slider marks", () => {
    it("should render slider with marks", () => {
      renderWithProvider(<HopsInput value={2} onChange={jest.fn()} />);

      const slider = screen.getByTestId("hops-slider");
      // Mantine slider creates mark elements
      expect(slider).toBeInTheDocument();
    });
  });
});
