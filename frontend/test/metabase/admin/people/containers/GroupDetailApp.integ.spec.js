import React from "react";
import mock from "xhr-mock";
import { mountWithStore } from "__support__/integration_tests";
import { refreshCurrentUser } from "metabase/redux/user";

import GroupDetailApp from "metabase/admin/people/containers/GroupDetailApp";

const MOCK_USER = {
  id: 1,
  first_name: "Testy",
  last_name: "McTestFace",
  email: "test@metabase.com",
};

describe("GroupDetailApp", () => {
  beforeEach(() => mock.setup());
  afterEach(() => mock.teardown());

  it("should load the user", async () => {
    expect.assertions(1);

    mock.get("/api/user/current", (req, res) => res.json(MOCK_USER));
    mock.get("/api/user", (req, res) => res.json([MOCK_USER]));
    mock.get("/api/permissions/group/42", (req, res) => {
      return res.json({
        id: 42,
        name: "Administrators",
        members: [{ ...MOCK_USER, user_id: MOCK_USER.id }],
      });
    });

    const { wrapper, store } = mountWithStore(
      <GroupDetailApp params={{ groupId: 42 }} />,
    );
    store.dispatch(refreshCurrentUser());

    expect((await wrapper.async.find("tr td")).map(td => td.text())).toEqual([
      "Testy McTestFace",
      "test@metabase.com",
    ]);
  });
});
