import { render, screen } from "@testing-library/react";

import { OVERLAY_Z_INDEX } from "metabase/ui/component-theme";
import { Button } from "metabase/ui/components/buttons/Button";
import { Modal } from "metabase/ui/components/overlays/Modal";
import { Tooltip } from "metabase/ui/components/overlays/Tooltip";

import { MetabaseUIProvider } from "./MetabaseUIProvider";

/* eslint-disable testing-library/no-node-access -- Mantine styles are not queryable by role */
const getStyleText = () =>
  Array.from(document.querySelectorAll("style[data-mantine-styles]"))
    .map((style) => style.textContent)
    .join("\n");

const parseVars = (css: string, prefix: string) =>
  Object.fromEntries(
    [...css.matchAll(/(--[\w-]+):\s*([^;]+);/g)]
      .filter(([, name]) => name.startsWith(prefix))
      .map(([, name, value]) => [name, value.trim()]),
  );

describe("MetabaseUIProvider", () => {
  it("renders children without any other wrapper", () => {
    render(
      <MetabaseUIProvider>
        <Button>x</Button>
      </MetabaseUIProvider>,
    );
    expect(screen.getByRole("button", { name: "x" })).toBeInTheDocument();
  });

  it("renders modals without an app-level overlay stack", () => {
    render(
      <MetabaseUIProvider>
        <Modal opened onClose={jest.fn()} title="Modal title">
          Modal body
        </Modal>
      </MetabaseUIProvider>,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("renders tooltips without an app-level portal container", () => {
    render(
      <MetabaseUIProvider>
        <Tooltip label="Tooltip label" opened>
          <button>target</button>
        </Tooltip>
      </MetabaseUIProvider>,
    );
    expect(screen.getByText("Tooltip label")).toBeInTheDocument();
  });

  it("writes --mb-overlay-z-index with the default overlay z-index", () => {
    render(<MetabaseUIProvider>x</MetabaseUIProvider>);
    expect(parseVars(getStyleText(), "--mb-overlay-")).toEqual({
      "--mb-overlay-z-index": String(OVERLAY_Z_INDEX),
    });
  });

  it("takes --mb-overlay-z-index from theme.other.popover.zIndex", () => {
    render(
      <MetabaseUIProvider theme={{ other: { popover: { zIndex: 500 } } }}>
        x
      </MetabaseUIProvider>,
    );
    expect(parseVars(getStyleText(), "--mb-overlay-")).toEqual({
      "--mb-overlay-z-index": "500",
    });
  });

  it("writes font and color variables to :root", () => {
    render(
      <MetabaseUIProvider>
        <Button>x</Button>
      </MetabaseUIProvider>,
    );

    const css = getStyleText();
    expect(css).toMatch(
      /:root\s*{[^}]*--mb-default-font-family: "Lato", Arial, sans-serif;/,
    );
    expect(css).toContain("--mb-default-monospace-font-family:");
    expect(css).toContain("--mb-color-core-brand:");
  });

  it("applies fontFamily and colorScheme", () => {
    const { unmount } = render(<MetabaseUIProvider>x</MetabaseUIProvider>);
    const lightBg = parseVars(getStyleText(), "--mb-color-")[
      "--mb-color-text-primary"
    ];
    unmount();

    render(
      <MetabaseUIProvider colorScheme="dark" fontFamily="Roboto, serif">
        x
      </MetabaseUIProvider>,
    );
    const css = getStyleText();
    expect(css).toContain("--mb-default-font-family: Roboto, serif;");
    expect(parseVars(css, "--mb-color-")["--mb-color-text-primary"]).not.toBe(
      lightBg,
    );
  });

  it("uses cssVariablesSelector", () => {
    render(
      <MetabaseUIProvider cssVariablesSelector=".mb-root">
        x
      </MetabaseUIProvider>,
    );
    expect(getStyleText()).toMatch(
      /\.mb-root\s*{[^}]*--mb-default-font-family/,
    );
  });

  it("sets the nonce on the style tag", () => {
    render(<MetabaseUIProvider nonce="abc123">x</MetabaseUIProvider>);
    const tags = document.querySelectorAll("style[data-mantine-styles]");
    expect(tags.length).toBeGreaterThan(0);
    tags.forEach((tag) => expect(tag).toHaveAttribute("nonce", "abc123"));
  });
});
