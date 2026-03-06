import type { ReactElement } from "react";

import { renderWithProviders, screen } from "__support__/ui";

import { HopsInput } from "./HopsInput";

const renderWithProvider = (component: ReactElement) => {
  return renderWithProviders(component);
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
  });

  describe("value changes", () => {
    it("should update displayed value when prop changes", () => {
      const { rerender } = renderWithProvider(
        <HopsInput value={2} onChange={jest.fn()} />,
      );

      expect(screen.getByText("2")).toBeInTheDocument();

      rerender(<HopsInput value={4} onChange={jest.fn()} />);

      expect(screen.getByText("4")).toBeInTheDocument();
      expect(screen.queryByText("2")).not.toBeInTheDocument();
    });
  });
});
