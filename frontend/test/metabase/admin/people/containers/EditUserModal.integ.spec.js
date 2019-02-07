import React from "react";
import mock from "xhr-mock";
import { mountWithStore } from "__support__/integration_tests";

import EditUserModal from "metabase/admin/people/containers/EditUserModal";

const MOCK_USER = {
  id: 42,
  first_name: "Testy",
  last_name: "McTestFace",
  email: "test@metabase.com",
};

describe("EditUserModal", () => {
  beforeEach(() => mock.setup());
  afterEach(() => mock.teardown());

  it("should load the user", async () => {
    mock.get("/api/user/42", (req, res) => res.json(MOCK_USER));
    const { wrapper, store } = mountWithStore(
      <EditUserModal params={{ userId: 42 }} />,
    );

    const inputs = await wrapper.async.find("input");
    expect(inputs.map(i => i.props().value)).toEqual([
      "Testy",
      "McTestFace",
      "test@metabase.com",
    ]);
  });
});
