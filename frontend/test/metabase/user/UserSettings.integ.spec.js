import React from "react";

import mock from "xhr-mock";

import { getFormValues } from "__support__/enzyme";
import { mountWithStore } from "__support__/integration";

import UserSettings from "metabase/user/components/UserSettings";
import Users from "metabase/entities/users";

const MOCK_USER = {
  first_name: "Testy",
  last_name: "McTestFace",
  email: "test@metabase.com",
};

describe("UserSettings", () => {
  beforeEach(() => mock.setup());
  afterEach(() => mock.teardown());

  it("should show user info", async () => {
    const { wrapper } = mountWithStore(
      <UserSettings
        user={MOCK_USER}
        tab="details"
        setTab={jest.fn()}
        updatePassword={jest.fn()}
      />,
    );

    const form = await wrapper.async.find("EntityForm");
    const values = await getFormValues(form);

    expect(values).toEqual(MOCK_USER);
  });

  it("should update the user without fetching memberships", async () => {
    const user = { ...MOCK_USER, id: 1 };
    const { wrapper, store } = mountWithStore(
      <UserSettings user={user} tab="details" />,
    );

    mock.put("/api/user/1", (req, res) => res.json(user));
    const getMemberships = jest.fn();
    mock.get("/api/permissions/membership", getMemberships);

    wrapper.find("button").simulate("submit");

    const { payload } = await store.waitForAction(Users.actionTypes.UPDATE);
    expect(payload.user.id).toBe(1);
    expect(getMemberships).not.toHaveBeenCalled();
  });
});
