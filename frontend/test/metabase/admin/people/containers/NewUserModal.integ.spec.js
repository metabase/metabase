import React from "react";
import _ from "underscore";
import mock from "xhr-mock";
import { mountWithStore } from "__support__/integration";
import { fillAndSubmitForm } from "__support__/enzyme";

import NewUserModal from "metabase/admin/people/containers/NewUserModal";

const MOCK_USER = {
  first_name: "Testy",
  last_name: "McTestFace",
  email: "test@metabase.com",
};

describe("NewUserModal", () => {
  beforeEach(() => mock.setup());
  afterEach(() => mock.teardown());

  it("should load the user", async () => {
    expect.assertions(2);

    mock.post("/api/user", (req, res) => {
      expect(_.omit(req.json(), "password")).toEqual(MOCK_USER);
      return res.json({ id: 42, ...MOCK_USER });
    });

    const { wrapper, store } = mountWithStore(<NewUserModal />);

    await fillAndSubmitForm(wrapper, MOCK_USER);

    const action = await store.waitForAction("@@router/CALL_HISTORY_METHOD");
    expect(action.payload.args[0].startsWith("/admin/people/42/success")).toBe(
      true,
    );
  });
});
