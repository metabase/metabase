import { Fragment } from "react";
import { Route } from "react-router";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import {
  renderHookWithProviders,
  renderWithProviders,
  screen,
} from "__support__/ui";
import type { TokenFeatures } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { useTroubleshootingTips } from "./useTroubleshootingTips";

interface SetupOptions {
  isHostAndPortError: boolean;
  expanded: boolean;
  isHosted?: boolean;
  showMetabaseLinks?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
}

const setup = (opts: SetupOptions) => {
  const {
    expanded,
    isHostAndPortError,
    isHosted = true,
    showMetabaseLinks,
    tokenFeatures = {},
  } = opts;
  return renderHookWithProviders(
    () => useTroubleshootingTips(isHostAndPortError, expanded),
    {
      withRouter: true,
      storeInitialState: createMockState({
        settings: mockSettings({
          "show-metabase-links": showMetabaseLinks,
          "token-features": createMockTokenFeatures(tokenFeatures),
          "is-hosted?": isHosted,
        }),
      }),
    },
  );
};

describe("useTroubleshootingTips", () => {
  describe("returns correct tips when", () => {
    it.each`
      isHostAndPortError | expanded | isHosted | tipsReturned
      ${false}           | ${false} | ${true}  | ${["ip-addresses", "ssl"]}
      ${false}           | ${false} | ${false} | ${["ssl", "permissions"]}
      ${false}           | ${true}  | ${true}  | ${["ip-addresses", "ssl", "permissions", "connection-settings", "credentials"]}
      ${false}           | ${true}  | ${false} | ${["ssl", "permissions", "connection-settings", "credentials"]}
      ${true}            | ${false} | ${true}  | ${[]}
      ${true}            | ${true}  | ${true}  | ${["ip-addresses", "ssl", "permissions", "connection-settings", "credentials"]}
      ${true}            | ${true}  | ${false} | ${["ssl", "permissions", "connection-settings", "credentials"]}
    `(
      `isHostAndPortError is $isHostAndPortError & expanded is $expanded & isHosted is $isHosted`,
      ({ isHostAndPortError, expanded, isHosted, tipsReturned }) => {
        const { result } = setup({
          isHostAndPortError,
          expanded,
          isHosted,
        });
        expect(result.current.map((tip) => tip.key)).toEqual(tipsReturned);
      },
    );
  });

  describe("showMetabaseLinks handling", () => {
    const linksSetup = (showMetabaseLinks: boolean) => {
      const storeInitialState = createMockState({
        settings: mockSettings({
          "show-metabase-links": showMetabaseLinks,
          "token-features": createMockTokenFeatures({ whitelabel: true }),
          "is-hosted?": true,
        }),
      });

      setupEnterprisePlugins();

      // This time we render inside a Route component to more easily assert links presence
      renderWithProviders(
        <Route
          path="*"
          component={() => {
            const tips = useTroubleshootingTips(false, true);

            return (
              <>
                {tips.map(({ body, key }) => (
                  <Fragment key={key}>{body}</Fragment>
                ))}
              </>
            );
          }}
        />,
        {
          withRouter: true,
          storeInitialState,
        },
      );
    };
    const expectedLinks = [
      /Metabase Cloud IP addresses/,
      /SSL certificate/,
      /correct permissions/,
    ];

    it("should render external doc links when showMetabaseLinks is true", () => {
      linksSetup(true);

      for (const name of expectedLinks) {
        const linkEl = screen.getByRole("link", { name });
        expect(linkEl).toBeInTheDocument();
        expect(linkEl).toHaveAttribute("target", "_blank");
      }
    });

    it("should not render links when showMetabaseLinks is false", () => {
      linksSetup(false);

      for (const name of expectedLinks) {
        expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
      }
    });
  });
});
