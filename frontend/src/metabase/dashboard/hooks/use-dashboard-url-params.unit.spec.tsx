import type { Location } from "history";
import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";

import { useDashboardUrlParams } from "./use-dashboard-url-params";

interface SetupOpts {
  hash: string;
}
function setup({ hash }: SetupOpts) {
  renderWithProviders(
    <>
      <Route path="*" component={TestComponent} />
    </>,
    {
      withRouter: true,
      initialRoute: hash,
    },
  );
}

interface TestComponentProps {
  location: Location;
}
const TestComponent = ({ location }: TestComponentProps) => {
  const { theme } = useDashboardUrlParams({
    location,
    onRefresh: jest.fn(),
  });
  return <>theme: {theme}</>;
};

describe("useDashboardUrlParams", () => {
  describe("should handle backward compatibility when `theme=transparent` and `background=false` (metabase#43838)", () => {
    it('should return theme: "light" by default', async () => {
      setup({
        hash: "#",
      });

      expect(await screen.findByText("theme: light")).toBeInTheDocument();
    });

    it('should return theme: "light" when provided', async () => {
      setup({
        hash: "#theme=light",
      });

      expect(await screen.findByText("theme: light")).toBeInTheDocument();
    });

    it('should return theme: "night" when provided', async () => {
      setup({
        hash: "#theme=night",
      });

      expect(await screen.findByText("theme: night")).toBeInTheDocument();
    });

    it('should return theme: "transparent" when provided', async () => {
      setup({
        hash: "#theme=transparent",
      });

      expect(await screen.findByText("theme: transparent")).toBeInTheDocument();
    });

    describe('background: "false"', () => {
      it('should return theme: "light" by default', async () => {
        setup({
          hash: "#background=false",
        });

        expect(await screen.findByText("theme: light")).toBeInTheDocument();
      });

      it('should return theme: "light" when provided', async () => {
        setup({
          hash: "#background=false&theme=light",
        });

        expect(await screen.findByText("theme: light")).toBeInTheDocument();
      });

      it('should return theme: "night" when provided', async () => {
        setup({
          hash: "#background=false&theme=night",
        });

        expect(await screen.findByText("theme: night")).toBeInTheDocument();
      });

      it('should return theme: "light" when `theme=transparent`, since the new behavior should take precedence', async () => {
        setup({
          hash: "#background=false&theme=transparent",
        });

        expect(await screen.findByText("theme: light")).toBeInTheDocument();
      });
    });
  });
});
