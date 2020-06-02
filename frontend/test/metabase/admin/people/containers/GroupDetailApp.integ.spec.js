import React from "react";
import mock from "xhr-mock";
import { mountWithStore } from "__support__/integration";
import { refreshCurrentUser } from "metabase/redux/user";

import GroupDetailApp from "metabase/admin/people/containers/GroupDetailApp";

const MOCK_USERS = [
  {
    id: 1,
    first_name: "Testy",
    last_name: "McTestFace",
    email: "test@metabase.com",
  },
  {
    id: 2,
    first_name: "David",
    last_name: "Attenborough",
    email: "dattenborough@metabase.com",
  },
];

const MOCK_MEMBERS = MOCK_USERS.map(({ id, ...user }) => ({
  ...user,
  user_id: id,
}));

describe("GroupDetailApp", () => {
  beforeEach(() => mock.setup());
  afterEach(() => mock.teardown());

  it("should load the user", async () => {
    expect.assertions(1);

    mock.get("/api/user/current", (req, res) => res.json(MOCK_USERS[0]));
    mock.get("/api/user", (req, res) => res.json([MOCK_USERS[0]]));
    mock.get("/api/permissions/group/42", (req, res) => {
      return res.json({
        id: 42,
        name: "Administrators",
        members: [MOCK_MEMBERS[0]],
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

  it("should not the current user remove themselvs from Administrators", async () => {
    expect.assertions(2);

    mock.get("/api/user/current", (req, res) => res.json(MOCK_USERS[0]));
    mock.get("/api/user", (req, res) => res.json(MOCK_USERS));
    mock.get("/api/permissions/group/42", (req, res) => {
      return res.json({
        id: 42,
        name: "Administrators",
        members: MOCK_MEMBERS,
      });
    });

    const { wrapper, store } = mountWithStore(
      <GroupDetailApp params={{ groupId: 42 }} />,
    );
    store.dispatch(refreshCurrentUser());

    const rows = await wrapper.async.find("tr");
    // we should only have a third column (removal option) for other users
    expect(rows.at(1).find("td").length).toBe(2);
    expect(rows.at(2).find("td").length).toBe(3);
  });
});
