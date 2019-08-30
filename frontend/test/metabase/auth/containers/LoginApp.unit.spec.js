import React from "react";

import LoginApp from "metabase/auth/containers/LoginApp";

import { mountWithStore } from "__support__/integration_tests";

jest.mock("metabase/lib/settings", () => ({
  get: () => ({
    tag: 1,
    version: 1,
  }),
  ssoEnabled: jest.fn(),
  ldapEnabled: jest.fn(),
}));

import Settings from "metabase/lib/settings";

describe("LoginApp", () => {
  describe("initial state", () => {
    describe("without SSO", () => {
      it("should show the login form", () => {
        const { wrapper } = mountWithStore(
          <LoginApp location={{ query: {} }} />,
        );
        expect(wrapper.find("FormField").length).toBe(2);
      });
    });
    describe("with SSO", () => {
      beforeEach(() => {
        Settings.ssoEnabled.mockReturnValue(true);
      });
      it("should show the SSO button", () => {
        const { wrapper } = mountWithStore(
          <LoginApp location={{ query: {} }} />,
        );
        expect(wrapper.find("SSOLoginButton").length).toBe(1);
        expect(wrapper.find(".Button.EmailSignIn").length).toBe(1);
      });

      it("should hide the login form initially", () => {
        const { wrapper } = mountWithStore(
          <LoginApp location={{ query: {} }} />,
        );
        expect(wrapper.find("FormField").length).toBe(0);
      });

      it("should show the login form if the url param is set", () => {
        const { wrapper } = mountWithStore(
          <LoginApp location={{ query: { useMBLogin: true } }} />,
        );

        expect(wrapper.find("FormField").length).toBe(2);
        expect(wrapper.find("SSOLoginButton").length).toBe(0);
      });
    });
  });
});
