import React from "react";
import mock from "xhr-mock";
import { mountWithStore } from "__support__/integration";
import { click } from "__support__/enzyme";
import { refreshCurrentUser } from "metabase/redux/user";
import UserAvatar from "metabase/components/UserAvatar";
import Radio from "metabase/components/Radio";
import EntityMenu from "metabase/components/EntityMenu";
import EntityMenuItem from "metabase/components/EntityMenuItem";
import EntityMenuTrigger from "metabase/components/EntityMenuTrigger";

import PeopleListingApp from "metabase/admin/people/containers/PeopleListingApp";

const MOCK_USERS = [
  {
    id: 1,
    first_name: "Testy",
    last_name: "McTestFace",
    email: "test@metabase.com",
    is_active: true,
  },
  {
    id: 2,
    first_name: "David",
    last_name: "Attenborough",
    email: "dattenborough@metabase.com",
    is_active: true,
  },
  {
    id: 3,
    first_name: "Hooty",
    last_name: "McOwlface",
    email: "hmcowlface@metabase.com",
    is_active: false,
  },
];

const MOCK_MEMBERS = MOCK_USERS.map(({ id, ...user }) => ({
  ...user,
  user_id: id,
}));

const MOCK_GROUPS = [
  { id: 1, name: "Administrators", member_count: MOCK_MEMBERS.length },
];

const mockApiCalls = () => {
  mock.get("/api/user/current", (req, res) => res.json(MOCK_USERS[0]));
  mock.get("/api/user?include_deactivated=true", (req, res) =>
    res.json(MOCK_USERS),
  );
  mock.get("/api/permissions/group", (req, res) => res.json(MOCK_GROUPS));
  mock.get("/api/permissions/membership", (req, res) =>
    res.json({
      "1": [
        { membership_id: 1, group_id: 1, user_id: 1 },
        { membership_id: 2, group_id: 1, user_id: 2 },
        { membership_id: 3, group_id: 1, user_id: 3 },
      ],
    }),
  );
};

describe("PeopleListingApp", () => {
  beforeEach(() => mock.setup());
  afterEach(() => mock.teardown());

  it("should load active users", async () => {
    expect.assertions(1);

    mockApiCalls();

    const { wrapper, store } = mountWithStore(<PeopleListingApp />);
    store.dispatch(refreshCurrentUser());

    const users = await wrapper.async.find(UserAvatar);
    expect(users.map(u => u.text())).toEqual(["DA", "TM"]);
  });

  it("should load inactive users", async () => {
    expect.assertions(1);

    mockApiCalls();

    const { wrapper, store } = mountWithStore(<PeopleListingApp />);
    store.dispatch(refreshCurrentUser());

    const radio = await wrapper.async.find(Radio);
    click(radio.find("input[value=true]"));

    const users = await wrapper.async.find(UserAvatar);
    expect(users.map(u => u.text())).toEqual(["HM"]);
  });

  it("should not let the current user deactivate themselves", async () => {
    expect.assertions(1);

    mockApiCalls();

    const { wrapper, store } = mountWithStore(<PeopleListingApp />);
    store.dispatch(refreshCurrentUser());

    const menus = await wrapper.async.find(EntityMenu);

    // the current user is at index 1 because of sorting
    click(menus.at(1).find(EntityMenuTrigger));
    const menuItems = await wrapper.async.find(EntityMenuItem);
    const menuItemLabels = menuItems.map(mi => mi.text());
    expect(menuItemLabels).toEqual(["Edit user", "Reset password"]);
  });

  it("should let the current user deactivate other admins", async () => {
    expect.assertions(1);

    mockApiCalls();

    const { wrapper, store } = mountWithStore(<PeopleListingApp />);
    store.dispatch(refreshCurrentUser());

    const menus = await wrapper.async.find(EntityMenu);

    click(menus.at(0).find(EntityMenuTrigger));
    const menuItems = await wrapper.async.find(EntityMenuItem);
    const menuItemLabels = menuItems.map(mi => mi.text());
    expect(menuItemLabels).toEqual([
      "Edit user",
      "Reset password",
      "Deactivate user",
    ]);
  });
});
