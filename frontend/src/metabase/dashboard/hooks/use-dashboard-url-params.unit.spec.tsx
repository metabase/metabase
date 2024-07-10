import type { Location } from "history";
import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";

import { useDashboardUrlParams } from "./use-dashboard-url-params";

describe("useDashboardUrlParams", () => {
  describe("should handle backward compatibility when `theme=transparent` and `background=false` (metabase#43838)", () => {
    it('should return theme: "light" by default', async () => {
      interface ComponentProps {
        location: Location;
      }
      const Component = ({ location }: ComponentProps) => {
        const { theme } = useDashboardUrlParams({
          location,
          onRefresh: jest.fn(),
        });
        return <>theme: {theme}</>;
      };

      renderWithProviders(
        <>
          <Route path="*" component={Component} />
        </>,
        {
          withRouter: true,
        },
      );

      expect(await screen.findByText("theme: light")).toBeInTheDocument();
    });

    it('should return theme: "light" when provided', async () => {
      interface ComponentProps {
        location: Location;
      }
      const Component = ({ location }: ComponentProps) => {
        const { theme } = useDashboardUrlParams({
          location,
          onRefresh: jest.fn(),
        });
        return <>theme: {theme}</>;
      };

      renderWithProviders(
        <>
          <Route path="*" component={Component} />
        </>,
        {
          withRouter: true,
          initialRoute: "#theme=light",
        },
      );

      expect(await screen.findByText("theme: light")).toBeInTheDocument();
    });

    it('should return theme: "night" when provided', async () => {
      interface ComponentProps {
        location: Location;
      }
      const Component = ({ location }: ComponentProps) => {
        const { theme } = useDashboardUrlParams({
          location,
          onRefresh: jest.fn(),
        });
        return <>theme: {theme}</>;
      };

      renderWithProviders(
        <>
          <Route path="*" component={Component} />
        </>,
        {
          withRouter: true,
          initialRoute: "#theme=night",
        },
      );

      expect(await screen.findByText("theme: night")).toBeInTheDocument();
    });

    it('should return theme: "transparent" when provided', async () => {
      interface ComponentProps {
        location: Location;
      }
      const Component = ({ location }: ComponentProps) => {
        const { theme } = useDashboardUrlParams({
          location,
          onRefresh: jest.fn(),
        });
        return <>theme: {theme}</>;
      };

      renderWithProviders(
        <>
          <Route path="*" component={Component} />
        </>,
        {
          withRouter: true,
          initialRoute: "#theme=transparent",
        },
      );

      expect(await screen.findByText("theme: transparent")).toBeInTheDocument();
    });

    describe('background: "false"', () => {
      it('should return theme: "light" by default', async () => {
        interface ComponentProps {
          location: Location;
        }
        const Component = ({ location }: ComponentProps) => {
          const { theme } = useDashboardUrlParams({
            location,
            onRefresh: jest.fn(),
          });
          return <>theme: {theme}</>;
        };

        renderWithProviders(
          <>
            <Route path="*" component={Component} />
          </>,
          {
            withRouter: true,
            initialRoute: "#background=false",
          },
        );

        expect(await screen.findByText("theme: light")).toBeInTheDocument();
      });

      it('should return theme: "light" when provided', async () => {
        interface ComponentProps {
          location: Location;
        }
        const Component = ({ location }: ComponentProps) => {
          const { theme } = useDashboardUrlParams({
            location,
            onRefresh: jest.fn(),
          });
          return <>theme: {theme}</>;
        };

        renderWithProviders(
          <>
            <Route path="*" component={Component} />
          </>,
          {
            withRouter: true,
            initialRoute: "#background=false&theme=light",
          },
        );

        expect(await screen.findByText("theme: light")).toBeInTheDocument();
      });

      it('should return theme: "night" when provided', async () => {
        interface ComponentProps {
          location: Location;
        }
        const Component = ({ location }: ComponentProps) => {
          const { theme } = useDashboardUrlParams({
            location,
            onRefresh: jest.fn(),
          });
          return <>theme: {theme}</>;
        };

        renderWithProviders(
          <>
            <Route path="*" component={Component} />
          </>,
          {
            withRouter: true,
            initialRoute: "#background=false&theme=night",
          },
        );

        expect(await screen.findByText("theme: night")).toBeInTheDocument();
      });

      it('should return theme: "light" when `theme=transparent`, since the new behavior should take precedence', async () => {
        interface ComponentProps {
          location: Location;
        }
        const Component = ({ location }: ComponentProps) => {
          const { theme } = useDashboardUrlParams({
            location,
            onRefresh: jest.fn(),
          });
          return <>theme: {theme}</>;
        };

        renderWithProviders(
          <>
            <Route path="*" component={Component} />
          </>,
          {
            withRouter: true,
            initialRoute: "#background=false&theme=transparent",
          },
        );

        expect(await screen.findByText("theme: light")).toBeInTheDocument();
      });
    });
  });
});
