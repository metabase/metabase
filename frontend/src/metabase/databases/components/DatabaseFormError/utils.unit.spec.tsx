import { renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { Route } from "react-router";

import { mockSettings } from "__support__/settings";
import {
  renderHookWithProviders,
  renderWithProviders,
  screen,
} from "__support__/ui";
import { createMockState } from "metabase-types/store/mocks";

import {
  type FormProvidersOptions,
  TestFormErrorProvider,
} from "./test-utils/TestFormErrorProvider";
import {
  getDocsLinkConditionally,
  useCloudGatewayIPs,
  useDatabaseErrorDetails,
} from "./utils";

describe("getDocsLinkConditionally", () => {
  const setup = (showMetabaseLinks: boolean) => {
    return renderWithProviders(
      <Route
        path="*"
        component={() => (
          <>
            {getDocsLinkConditionally(
              "My Link Title",
              "https://metabase.com/docs",
              showMetabaseLinks,
            )}
          </>
        )}
      />,
      {
        withRouter: true,
        initialRoute: "/",
      },
    );
  };

  it("does not render a link if showMetabaseLinks is false", () => {
    setup(false);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("My Link Title")).toBeInTheDocument();
  });

  it("renders a link if showMetabaseLinks is true", () => {
    setup(true);
    expect(
      screen.getByRole("link", { name: "My Link Title" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "My Link Title" })).toHaveAttribute(
      "href",
      "https://metabase.com/docs",
    );
    expect(screen.getByRole("link", { name: "My Link Title" })).toHaveAttribute(
      "target",
      "_blank",
    );
  });
});

describe("useCloudGatewayIPs", () => {
  const setup = (cloudGatewayIPs: string[] | null) => {
    return renderHookWithProviders(useCloudGatewayIPs, {
      storeInitialState: createMockState({
        settings: mockSettings({
          "cloud-gateway-ips": cloudGatewayIPs,
        }),
      }),
    });
  };

  it("returns the cloud gateway IPs from settings", () => {
    const { result } = setup(["1.1.1.1", "2.2.2.2"]);
    expect(result.current).toEqual(["1.1.1.1", "2.2.2.2"]);
  });

  it("returns the default IP list if none is defined in settings", () => {
    const { result } = setup(null);
    expect(result.current).toEqual([
      "18.207.81.126",
      "3.211.20.157",
      "50.17.234.169",
    ]);
  });
});

describe("useDatabaseErrorDetails", () => {
  const setup = (opts: FormProvidersOptions) => {
    const { errorVariant, errorMessage } = opts;
    const FormProviderWrapper = ({ children }: PropsWithChildren) => (
      <TestFormErrorProvider
        errorVariant={errorVariant}
        errorMessage={errorMessage}
      >
        {children}
      </TestFormErrorProvider>
    );

    return renderHook(() => useDatabaseErrorDetails(), {
      wrapper: FormProviderWrapper,
      initialProps: {
        errorVariant,
        errorMessage,
      },
    });
  };

  it("should return the correct error message when error variant is 'hostAndPort'", () => {
    const { result } = setup({
      errorVariant: "hostAndPort",
      errorMessage: "Random error message",
    });
    expect(result.current.errorMessage).toBe(
      "Make sure your Host and Port settings are correct.",
    );
    expect(result.current.isHostAndPortError).toBe(true);
  });

  it("should return the correct error message when error variant is 'generic'", () => {
    const { result } = setup({
      errorVariant: "generic",
      errorMessage: "Generic error message",
    });
    expect(result.current.errorMessage).toBe("Generic error message");
    expect(result.current.isHostAndPortError).toBe(false);
  });
});
