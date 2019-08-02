import React from "react";
import mock from "xhr-mock";
import { mountWithStore } from "__support__/integration";
import { click, clickButton } from "__support__/enzyme";

import UserPasswordResetModal from "metabase/admin/people/containers/UserPasswordResetModal";

import MetabaseSettings from "metabase/lib/settings";

const MOCK_USER = {
  first_name: "Testy",
  last_name: "McTestFace",
  email: "test@metabase.com",
};

describe("UserPasswordResetModal", () => {
  beforeEach(() => mock.setup());
  afterEach(() => mock.teardown());

  describe("with email not configured", () => {
    beforeEach(() => {
      MetabaseSettings.isEmailConfigured = () => false;
    });
    it("should change the user's password to random password", async () => {
      expect.assertions(3);

      let newPassword;

      mock.get("/api/user/42", (req, res) =>
        res.json({ id: 42, ...MOCK_USER }),
      );
      mock.put("/api/user/42/password", (req, res) => {
        expect(Object.keys(req.json())).toEqual(["password"]);
        newPassword = req.json().password;
        return res.json({ id: 42, ...MOCK_USER });
      });

      const { wrapper } = mountWithStore(
        <UserPasswordResetModal params={{ userId: 42 }} />,
      );

      const resetButton = await wrapper.async.find(".Button--danger");
      expect(resetButton.length).toBe(1);

      clickButton(resetButton);

      const showPasswordLink = await wrapper.async.find(".link");
      click(showPasswordLink);

      const passwordReveal = await wrapper.async.find("input");
      expect(passwordReveal.props().value).toBe(newPassword);
    });
  });
  describe("with email configured", () => {
    beforeEach(() => {
      MetabaseSettings.isEmailConfigured = () => true;
    });
    it("should trigger a password reset email", async () => {
      expect.assertions(1);

      mock.get("/api/user/42", (req, res) =>
        res.json({ id: 42, ...MOCK_USER }),
      );
      mock.post("/api/session/forgot_password", (req, res) => {
        expect(req.json().email).toEqual(MOCK_USER.email);
        return res.json({});
      });

      const { wrapper, store } = mountWithStore(
        <UserPasswordResetModal params={{ userId: 42 }} />,
      );

      const resetButton = await wrapper.async.find(".Button--danger");
      clickButton(resetButton);

      await store.waitForAction("@@router/CALL_HISTORY_METHOD");
    });
  });
});
