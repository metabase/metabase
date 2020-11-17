import React from "react";
import mock from "xhr-mock";
import { mountWithStore } from "__support__/integration";
import { fillAndSubmitForm, getFormValues } from "__support__/enzyme";

import EditUserModal from "metabase/admin/people/containers/EditUserModal";

const MOCK_USER = {
  first_name: "Testy",
  last_name: "McTestFace",
  email: "test@metabase.com",
};

describe("EditUserModal", () => {
  beforeEach(() => mock.setup());
  afterEach(() => mock.teardown());

  it("should load the user", async () => {
    expect.assertions(3);

    mock.get("/api/user/42", (req, res) => res.json({ id: 42, ...MOCK_USER }));
    mock.put("/api/user/42", (req, res) => {
      expect(req.json()).toEqual({ ...MOCK_USER, first_name: "Bob" });
      return res.json({ id: 42, ...MOCK_USER, first_name: "Bob" });
    });

    const { wrapper, store } = mountWithStore(
      <EditUserModal params={{ userId: 42 }} />,
    );

    expect(await getFormValues(wrapper)).toEqual(MOCK_USER);

    await fillAndSubmitForm(wrapper, { first_name: "Bob" });

    await store.waitForAction("metabase/entities/users/UPDATE");

    expect(await getFormValues(wrapper)).toEqual({
      ...MOCK_USER,
      first_name: "Bob",
    });
  });
});
