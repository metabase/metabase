import React from "react";

import "__support__/mocks";
import "metabase/plugins/builtin";
import "metabase-enterprise/plugins";
import LoginApp from "metabase/auth/containers/LoginApp";

import { mountWithStore } from "__support__/integration";

const SELECTOR_FOR_EMAIL_LINK = `[to="/auth/login/password"]`;

jest.mock("metabase/components/LogoIcon", () => () => null);

import Settings from "metabase/lib/settings";

describe("LoginApp - Enterprise", () => {
  describe("initial state", () => {
    describe("with Google and password disabled", () => {
      beforeEach(() => {
        Settings.set("google-auth-client-id", 123);
      });
      it("should show the SSO button without an option to use password", () => {
        const { wrapper } = mountWithStore(<LoginApp params={{}} />);
        expect(wrapper.find("AuthProviderButton").length).toBe(1);
        expect(wrapper.find(SELECTOR_FOR_EMAIL_LINK).length).toBe(0);
      });
    });
  });
});
