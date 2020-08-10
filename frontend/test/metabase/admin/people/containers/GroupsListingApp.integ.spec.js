import React from "react";
import mock from "xhr-mock";
import { mountWithStore } from "__support__/integration";

import GroupsListingApp from "metabase/admin/people/containers/GroupsListingApp";

describe("GroupsListingApp", () => {
  beforeEach(() => mock.setup());
  afterEach(() => mock.teardown());

  it("should load the user", async () => {
    expect.assertions(1);

    mock.get("/api/permissions/group", (req, res) =>
      res.json([
        { id: 2, name: "Administrators", member_count: 1 },
        { id: 1, name: "All Users", member_count: 1 },
      ]),
    );

    const { wrapper } = mountWithStore(<GroupsListingApp />);

    expect((await wrapper.async.find("tr td")).map(td => td.text())).toEqual([
      // NOTE: the extra "A"s are from the circle icon
      "AAdministrators",
      "1",
      "",
      "AAll Users",
      "1",
      "",
    ]);
  });
});
