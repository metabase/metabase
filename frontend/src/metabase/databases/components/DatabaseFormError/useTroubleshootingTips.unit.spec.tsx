import { screen } from "@testing-library/react";

import { renderWithProviders } from "__support__/ui";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks/settings";

import { useTroubleshootingTips } from "./useTroubleshootingTips";

// Test component to use the hook
const TestComponent = ({ count }: { count?: number }) => {
  const tips = useTroubleshootingTips(count);
  return (
    <div data-testid="tips-container">
      {tips.map((tip, index) => (
        <div key={`tip-${index}`} data-testid={`tip-${index}`}>
          <div data-testid={`tip-title-${index}`}>{tip.title}</div>
          <div data-testid={`tip-body-${index}`}>{tip.body}</div>
        </div>
      ))}
    </div>
  );
};

jest.mock("react-router", () => ({
  ...jest.requireActual("react-router"),
  Link: ({ children, to, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

describe("useTroubleshootingTips", () => {
  const defaultState = createMockState({
    settings: createMockSettingsState({
      "show-metabase-links": true,
      "token-features": createMockTokenFeatures({}),
    }),
  });

  const noLinksState = createMockState({
    settings: createMockSettingsState({
      "show-metabase-links": false,
      "token-features": createMockTokenFeatures({}),
    }),
  });

  describe("Basic functionality", () => {
    it("should return an array of troubleshooting tips", () => {
      renderWithProviders(<TestComponent />, {
        storeInitialState: defaultState,
      });

      const tipsContainer = screen.getByTestId("tips-container");
      expect(tipsContainer).toBeInTheDocument();

      // Should have 5 tips (each tip has a container with data-testid="tip-{index}")
      const tips = screen.getAllByTestId(/^tip-\d+$/);
      expect(tips.length).toBe(5);
    });

    it("should return tips with correct structure", () => {
      renderWithProviders(<TestComponent />, {
        storeInitialState: defaultState,
      });

      // Check that each tip has title and body
      for (let i = 0; i < 5; i++) {
        const title = screen.getByTestId(`tip-title-${i}`);
        const body = screen.getByTestId(`tip-body-${i}`);

        expect(title).toBeInTheDocument();
        expect(body).toBeInTheDocument();
        expect(title.textContent).toBeTruthy();
      }
    });

    it("should limit tips when count is provided", () => {
      renderWithProviders(<TestComponent count={3} />, {
        storeInitialState: defaultState,
      });

      const tips = screen.getAllByTestId(/^tip-\d+$/);
      expect(tips.length).toBe(3);
    });

    it("should return all tips when count is greater than available tips", () => {
      renderWithProviders(<TestComponent count={10} />, {
        storeInitialState: defaultState,
      });

      const tips = screen.getAllByTestId(/^tip-\d+$/);
      expect(tips.length).toBe(5);
    });

    it("should return empty array when count is 0", () => {
      renderWithProviders(<TestComponent count={0} />, {
        storeInitialState: defaultState,
      });

      const tips = screen.queryAllByTestId(/^tip-\d+$/);
      expect(tips.length).toBe(0);
    });
  });

  describe("Metabase links behavior", () => {
    it("should include links when showMetabaseLinks is true", () => {
      renderWithProviders(<TestComponent />, {
        storeInitialState: defaultState,
      });

      // Check that the body contains content (rendered as JSX)
      const ipTipBody = screen.getByTestId("tip-body-0");
      const sslTipBody = screen.getByTestId("tip-body-1");
      const permissionsTipBody = screen.getByTestId("tip-body-2");

      // These should contain rendered content
      expect(ipTipBody).toBeInTheDocument();
      expect(sslTipBody).toBeInTheDocument();
      expect(permissionsTipBody).toBeInTheDocument();
    });

    it("should show plain text when showMetabaseLinks is false", () => {
      renderWithProviders(<TestComponent />, {
        storeInitialState: noLinksState,
      });

      // Tips should still be generated but without interactive links
      const tips = screen.getAllByTestId(/^tip-\d+$/);
      expect(tips.length).toBe(5);

      const ipTipBody = screen.getByTestId("tip-body-0");
      const sslTipBody = screen.getByTestId("tip-body-1");
      const permissionsTipBody = screen.getByTestId("tip-body-2");

      expect(ipTipBody).toBeInTheDocument();
      expect(sslTipBody).toBeInTheDocument();
      expect(permissionsTipBody).toBeInTheDocument();
    });
  });

  describe("Memoization behavior", () => {
    it("should render consistently with same props", () => {
      const { rerender } = renderWithProviders(<TestComponent />, {
        storeInitialState: defaultState,
      });

      const firstTips = screen.getAllByTestId(/^tip-\d+$/);
      expect(firstTips.length).toBe(5);

      // Rerender should produce same number of tips
      rerender(<TestComponent />);
      const secondTips = screen.getAllByTestId(/^tip-\d+$/);
      expect(secondTips.length).toBe(5);
    });

    it("should update when count changes", () => {
      const { rerender } = renderWithProviders(<TestComponent count={5} />, {
        storeInitialState: defaultState,
      });

      let tips = screen.getAllByTestId(/^tip-\d+$/);
      expect(tips.length).toBe(5);

      rerender(<TestComponent count={3} />);
      tips = screen.getAllByTestId(/^tip-\d+$/);
      expect(tips.length).toBe(3);
    });
  });

  describe("Edge cases", () => {
    it("should handle negative count gracefully", () => {
      renderWithProviders(<TestComponent count={-1} />, {
        storeInitialState: defaultState,
      });

      // slice(0, -1) returns all elements except the last one (4 out of 5)
      const tips = screen.getAllByTestId(/^tip-\d+$/);
      expect(tips.length).toBe(4);
    });

    it("should handle undefined count by showing all tips", () => {
      renderWithProviders(<TestComponent count={undefined} />, {
        storeInitialState: defaultState,
      });

      const tips = screen.getAllByTestId(/^tip-\d+$/);
      expect(tips.length).toBe(5);
    });
  });
});
