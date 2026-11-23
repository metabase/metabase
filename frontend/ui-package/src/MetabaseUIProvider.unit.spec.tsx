import { useMantineTheme } from "@mantine/core";
import { render, screen } from "@testing-library/react";

import { Modal, Tooltip, useColorScheme } from "../../src/metabase/ui";
import { PORTAL_CONTAINER_ID } from "../../src/metabase/ui/components/overlays/PortalContainer";

import { MetabaseUIProvider } from "./MetabaseUIProvider";

const readVariable = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const ThemeProbe = () => {
  const theme = useMantineTheme();
  const { colorScheme, resolvedColorScheme } = useColorScheme();
  return (
    <div
      data-testid="probe"
      data-scheme={theme.other.colorScheme}
      data-font={theme.fontFamily}
      data-radius={String(theme.defaultRadius)}
      data-brand={theme.colors["core-brand"][0]}
      data-context={`${colorScheme}/${resolvedColorScheme}`}
    />
  );
};

describe("MetabaseUIProvider", () => {
  it("writes the CSS variables for the light scheme", () => {
    render(<MetabaseUIProvider>content</MetabaseUIProvider>);
    expect(readVariable("--mb-color-core-brand")).toBeTruthy();
    expect(readVariable("--mb-default-font-family")).toBe(
      '"Lato", Arial, sans-serif',
    );
    expect(readVariable("--mb-overlay-z-index")).toMatch(/^\d+$/);
  });

  it("writes different colors for the dark scheme and updates on change", () => {
    const { rerender } = render(
      <MetabaseUIProvider>content</MetabaseUIProvider>,
    );
    const light = readVariable("--mb-color-background_page-secondary");
    expect(light).toBeTruthy();

    rerender(
      <MetabaseUIProvider colorScheme="dark" fontFamily="Inter, sans-serif">
        content
      </MetabaseUIProvider>,
    );
    const dark = readVariable("--mb-color-background_page-secondary");
    expect(dark).toBeTruthy();
    expect(dark).not.toBe(light);
    expect(readVariable("--mb-default-font-family")).toBe("Inter, sans-serif");
  });

  it("applies the scheme, ignores owned keys and keeps other overrides", () => {
    const { rerender } = render(
      <MetabaseUIProvider colorScheme="dark">
        <ThemeProbe />
      </MetabaseUIProvider>,
    );
    const brand = screen.getByTestId("probe").getAttribute("data-brand");
    expect(brand).toBeTruthy();

    rerender(
      <MetabaseUIProvider
        colorScheme="dark"
        theme={{
          fontFamily: "Comic Sans MS",
          colors: {
            "core-brand": [
              "#000",
              "#000",
              "#000",
              "#000",
              "#000",
              "#000",
              "#000",
              "#000",
              "#000",
              "#000",
            ],
          },
          defaultRadius: "xl",
          other: { colorScheme: "light" },
        }}
      >
        <ThemeProbe />
      </MetabaseUIProvider>,
    );
    const probe = screen.getByTestId("probe");
    expect(probe).toHaveAttribute("data-scheme", "dark");
    expect(probe).toHaveAttribute("data-font", "var(--mb-default-font-family)");
    expect(probe).toHaveAttribute("data-brand", brand);
    expect(probe).toHaveAttribute("data-radius", "xl");
    expect(probe).toHaveAttribute("data-context", "dark/dark");
  });

  it("renders overlays and the portal container", async () => {
    render(
      <MetabaseUIProvider>
        <Tooltip label="Tip" opened>
          <button>target</button>
        </Tooltip>
        <Modal opened onClose={() => undefined} title="Title">
          body
        </Modal>
      </MetabaseUIProvider>,
    );
    const tooltip = await screen.findByText("Tip");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    // eslint-disable-next-line testing-library/no-node-access -- the container has no role
    const container = document.getElementById(PORTAL_CONTAINER_ID);
    expect(container).toBeInTheDocument();
    expect(document.body).toContainElement(container);
    expect(container).toContainElement(tooltip);
  });

  it("falls back to the default z-index when an override sets undefined", () => {
    render(
      <MetabaseUIProvider theme={{ other: { popover: { zIndex: undefined } } }}>
        content
      </MetabaseUIProvider>,
    );
    expect(readVariable("--mb-overlay-z-index")).toBe("200");
  });

  it("writes a custom popover z-index", () => {
    render(
      <MetabaseUIProvider theme={{ other: { popover: { zIndex: 9999 } } }}>
        content
      </MetabaseUIProvider>,
    );
    expect(readVariable("--mb-overlay-z-index")).toBe("9999");
  });

  it("renders a tooltip into an element passed as its portal target", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);

    render(
      <MetabaseUIProvider
        theme={{
          components: {
            Tooltip: { defaultProps: { portalProps: { target } } },
          },
        }}
      >
        <Tooltip label="Tip" opened>
          <span>Target</span>
        </Tooltip>
      </MetabaseUIProvider>,
    );

    expect(target).toContainElement(await screen.findByText("Tip"));
    target.remove();
  });

  it.each(["light", "dark"] as const)(
    "uses the %s primary shade for theme color lookup",
    (colorScheme) => {
      const primaryShade = { light: 4, dark: 6 } as const;
      const Shade = () => {
        const theme = useMantineTheme();
        return (
          <output>
            {theme.fn.themeColor("core-brand") ===
            theme.colors["core-brand"][primaryShade[colorScheme]]
              ? "Expected shade"
              : "Unexpected shade"}
          </output>
        );
      };

      render(
        <MetabaseUIProvider colorScheme={colorScheme} theme={{ primaryShade }}>
          <Shade />
        </MetabaseUIProvider>,
      );

      expect(screen.getByRole("status")).toHaveTextContent(/^Expected shade$/);
    },
  );
});
