import React from "react";
import mock from "xhr-mock";
import { mountWithStore } from "__support__/integration";
import { clickButton } from "__support__/enzyme";

import UserActivationModal from "metabase/admin/people/containers/UserActivationModal";

const MOCK_USER = {
  first_name: "Testy",
  last_name: "McTestFace",
  email: "test@metabase.com",
  is_active: true,
};

describe("UserActivationModal", () => {
  beforeEach(() => mock.setup());
  afterEach(() => mock.teardown());

  describe("with active user", () => {
    it("should deactivate the user", async () => {
      expect.assertions(1);

      // NOTE: currently loads the list of users since deactivated users return 404 from /api/user/:id
      mock.get("/api/user?include_deactivated=true", (req, res) =>
        res.json([{ id: 42, ...MOCK_USER }]),
      );
      mock.delete("/api/user/42", (req, res) => {
        return res.json({ success: true });
      });

      const onClose = jest.fn();
      const { wrapper } = mountWithStore(
        <UserActivationModal params={{ userId: 42 }} onClose={onClose} />,
      );

      const deactivateButton = await wrapper.async.find(".Button--danger");
      clickButton(deactivateButton);
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("with deactivated user", () => {
    it("reactivate the user", async () => {
      expect.assertions(1);

      // NOTE: currently loads the list of users since deactivated users return 404 from /api/user/:id
      mock.get("/api/user?include_deactivated=true", (req, res) =>
        res.json([{ id: 42, ...MOCK_USER, is_active: false }]),
      );
      mock.put("/api/user/42/reactivate", (req, res) => {
        return res.json({ id: 42, ...MOCK_USER });
      });

      const onClose = jest.fn();
      const { wrapper } = mountWithStore(
        <UserActivationModal params={{ userId: 42 }} onClose={onClose} />,
      );

      const resetButton = await wrapper.async.find(".Button--danger");
      clickButton(resetButton);
      expect(onClose).toHaveBeenCalled();
    });
  });
});
