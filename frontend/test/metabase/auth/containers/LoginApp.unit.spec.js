import React from "react";

import LoginApp from "metabase/auth/containers/LoginApp";

import { mountWithStore } from "__support__/integration";

import Settings from "metabase/lib/settings";

describe("LoginApp", () => {
  describe("initial state", () => {
    describe("without SSO", () => {
      it("should show the login form", () => {
        const { wrapper } = mountWithStore(
          <LoginApp location={{ query: {} }} />,
        );
        expect(wrapper.find("FormField").length).toBe(3);
      });
    });
    describe("with SSO", () => {
      beforeEach(() => {
        Settings.set("google-auth-client-id", "something");
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

        expect(wrapper.find("FormField").length).toBe(3);
        expect(wrapper.find("SSOLoginButton").length).toBe(0);
      });
    });
  });
});
