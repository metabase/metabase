import React from "react";

import "metabase/plugins/builtin";

import LoginApp from "metabase/auth/containers/LoginApp";

import { mountWithStore } from "__support__/integration";

jest.mock("metabase/components/LogoIcon", () => () => null);

import Settings from "metabase/lib/settings";
const SELECTOR_FOR_EMAIL_LINK = `[to="/auth/login/password"]`;

describe("LoginApp", () => {
  describe("initial state", () => {
    describe("without SSO", () => {
      it("should show the login form", () => {
        const { wrapper } = mountWithStore(<LoginApp params={{}} />);
        expect(wrapper.find("FormField").length).toBe(3);
      });
    });
    describe("with SSO", () => {
      beforeEach(() => {
        Settings.set("google-auth-client-id", 123);
      });
      it("should show the SSO button", () => {
        const { wrapper } = mountWithStore(<LoginApp params={{}} />);
        expect(wrapper.find("AuthProviderButton").length).toBe(1);
        expect(wrapper.find(SELECTOR_FOR_EMAIL_LINK).length).toBe(1);
      });

      it("should hide the login form initially", () => {
        const { wrapper } = mountWithStore(<LoginApp params={{}} />);
        expect(wrapper.find("FormField").length).toBe(0);
      });

      it("should show the login form if the url param is set", () => {
        const { wrapper } = mountWithStore(
          <LoginApp params={{ provider: "password" }} />,
        );

        expect(wrapper.find("FormField").length).toBe(3);
        expect(wrapper.find("AuthProviderButton").length).toBe(0);
      });
    });
  });
});
