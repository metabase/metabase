import { act, render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";

import type { MetabaseEmbeddingSdkBundleExports } from "embedding-sdk-bundle/types/sdk-bundle";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";
import type { MetabaseEmbeddingTheme } from "metabase/embedding-sdk/theme";

import { SdkThemeProviderWithStore } from "./SdkThemeProviderWithStore";

const FakeThemedProvider = ({
  children,
  theme,
}: PropsWithChildren<{ store: unknown; theme?: MetabaseEmbeddingTheme }>) => (
  <div data-testid="themed">
    <div data-testid="theme-preset">
      {(typeof theme === "object" && "preset" in theme && theme.preset) ||
        "none"}
    </div>
    {children}
  </div>
);

const setBundleGlobal = (withThemeProvider: boolean) => {
  // The spec only needs the one export the wrapper reaches for; the full
  // bundle contract is irrelevant here.
  window.METABASE_EMBEDDING_SDK_BUNDLE = (
    withThemeProvider ? { SdkThemeProviderWithStore: FakeThemedProvider } : {}
  ) as MetabaseEmbeddingSdkBundleExports;
};

const setReduxStore = (store: unknown) => {
  ensureMetabaseProviderPropsStore().updateInternalProps({
    // A stand-in — the wrapper only passes the store through.
    reduxStore: store as never,
  });
};

afterEach(() => {
  delete window.METABASE_EMBEDDING_SDK_BUNDLE;
  ensureMetabaseProviderPropsStore().cleanup();
});

describe("package SdkThemeProviderWithStore", () => {
  it("renders children untouched before the bundle is on the page", () => {
    render(
      <SdkThemeProviderWithStore>
        <div>content</div>
      </SdkThemeProviderWithStore>,
    );

    expect(screen.getByText("content")).toBeInTheDocument();
    expect(screen.queryByTestId("themed")).not.toBeInTheDocument();
  });

  it("renders children untouched while the redux store is not initialized, even with the bundle present", () => {
    // Regression: the data-app dev preview crashed on its second mount —
    // the bundle global from the previous page lifecycle was already there, so
    // the wrapper mounted the bundle's theme provider (which reads the redux
    // store) without any store to read.
    setBundleGlobal(true);

    render(
      <SdkThemeProviderWithStore>
        <div>content</div>
      </SdkThemeProviderWithStore>,
    );

    expect(screen.getByText("content")).toBeInTheDocument();
    expect(screen.queryByTestId("themed")).not.toBeInTheDocument();
  });

  it("renders children untouched when the instance's bundle predates the with-store export", () => {
    setBundleGlobal(false);
    setReduxStore({});

    render(
      <SdkThemeProviderWithStore>
        <div>content</div>
      </SdkThemeProviderWithStore>,
    );

    expect(screen.getByText("content")).toBeInTheDocument();
    expect(screen.queryByTestId("themed")).not.toBeInTheDocument();
  });

  it("mounts the bundle's themed provider once both the bundle and the store exist", () => {
    setBundleGlobal(true);

    render(
      <SdkThemeProviderWithStore theme={{ preset: "dark" }}>
        <div>content</div>
      </SdkThemeProviderWithStore>,
    );

    act(() => {
      setReduxStore({});
    });

    expect(screen.getByTestId("themed")).toBeInTheDocument();
    expect(screen.getByTestId("theme-preset")).toHaveTextContent("dark");
    expect(screen.getByText("content")).toBeInTheDocument();
  });
});
