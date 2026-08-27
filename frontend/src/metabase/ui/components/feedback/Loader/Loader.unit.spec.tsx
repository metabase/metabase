import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";

import { Loader, type LoaderProps, setCustomLoader } from "./Loader";
import { loaderOverrides } from "./Loader.config";

type SetupOpts = LoaderProps & {
  withTheme?: boolean;
};

function setup({ withTheme = false, ...props }: SetupOpts = {}) {
  const theme = withTheme ? { components: loaderOverrides } : undefined;

  function wrap(loaderProps: LoaderProps) {
    return (
      <MantineProvider theme={theme}>
        <Loader {...loaderProps} />
      </MantineProvider>
    );
  }

  const { rerender } = render(wrap(props));

  function rerenderLoader(nextProps: LoaderProps = props) {
    return rerender(wrap(nextProps));
  }

  return { rerender: rerenderLoader };
}

function getLoader() {
  return screen.getByTestId("loading-indicator");
}

function getLoaderVar(name: string) {
  return getLoader().style.getPropertyValue(name);
}

function CustomLoader() {
  return <div data-testid="custom-loader">Custom Loader</div>;
}

describe("Loader", () => {
  beforeEach(() => {
    setCustomLoader(undefined);
  });

  it("renders default Mantine Loader when no custom loader is set", () => {
    setup();

    expect(getLoader()).toBeInTheDocument();
    expect(getLoader()).toHaveClass("mantine-Loader-root");
  });

  it("renders custom loader when one is set", () => {
    setCustomLoader(CustomLoader);
    setup();

    expect(screen.getByTestId("custom-loader")).toBeInTheDocument();
    expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();
  });

  it("switches back to default loader when custom loader is cleared", () => {
    setCustomLoader(CustomLoader);
    const { rerender } = setup();
    expect(screen.getByTestId("custom-loader")).toBeInTheDocument();

    setCustomLoader(undefined);
    rerender();

    expect(screen.queryByTestId("custom-loader")).not.toBeInTheDocument();
    expect(getLoader()).toBeInTheDocument();
  });

  describe("testid", () => {
    it("defaults to loading-indicator", () => {
      setup();

      expect(getLoader()).toBeInTheDocument();
    });

    it("can be overridden", () => {
      setup({ "data-testid": "custom-testid" });

      expect(screen.getByTestId("custom-testid")).toBeInTheDocument();
      expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();
    });
  });

  describe("size", () => {
    it.each([
      ["xs", "0.75rem"],
      ["sm", "0.875rem"],
      ["md", "1rem"],
      ["lg", "1.125rem"],
      ["xl", "1.375rem"],
    ] as const)("resolves %s to %s", (size, expected) => {
      setup({ withTheme: true, size });

      expect(getLoaderVar("--loader-size")).toBe(
        `calc(${expected} * var(--mantine-scale))`,
      );
    });

    it("defaults to md", () => {
      setup({ withTheme: true });

      expect(getLoaderVar("--loader-size")).toBe(
        "calc(1rem * var(--mantine-scale))",
      );
    });

    it("passes unnamed sizes through to Mantine", () => {
      setup({ withTheme: true, size: 48 });

      expect(getLoaderVar("--loader-size")).toBe(
        "calc(3rem * var(--mantine-scale))",
      );
    });

    it("sets data-size for named sizes, so the ring override can match", () => {
      setup({ withTheme: true, size: "lg" });

      expect(getLoader()).toHaveAttribute("data-size", "lg");
    });

    it("sets no data-size for numeric sizes", () => {
      setup({ withTheme: true, size: 48 });

      expect(getLoader()).not.toHaveAttribute("data-size");
    });
  });

  describe("color", () => {
    it("defaults to the icon-brand token", () => {
      setup({ withTheme: true });

      expect(getLoaderVar("--loader-color")).toBe("var(--mb-color-icon-brand)");
    });

    it("is overridden by an explicit color prop", () => {
      setup({ withTheme: true, color: "text-secondary" });

      expect(getLoaderVar("--loader-color")).toBe("text-secondary");
    });
  });

  describe("label", () => {
    function getLabelFontSize(label: string) {
      return screen.getByText(label).style.getPropertyValue("--text-fz");
    }

    it("renders the label alongside the loader", () => {
      setup({ label: "Loading…" });

      expect(screen.getByText("Loading…")).toBeInTheDocument();
      expect(getLoader()).toBeInTheDocument();
    });

    it.each([
      ["xs", "sm"],
      ["sm", "sm"],
      ["md", "md"],
      ["lg", "md"],
      ["xl", "md"],
    ] as const)(
      "sizes the label of a %s loader with the %s token",
      (size, expected) => {
        setup({ label: "Loading…", size });

        expect(getLabelFontSize("Loading…")).toBe(
          `var(--mantine-font-size-${expected})`,
        );
      },
    );

    it.each([48, "3rem"])(
      "falls back to the md label size for unnamed loader size %p",
      (size) => {
        setup({ label: "Loading…", size });

        expect(getLabelFontSize("Loading…")).toBe(
          "var(--mantine-font-size-md)",
        );
      },
    );
  });
});
