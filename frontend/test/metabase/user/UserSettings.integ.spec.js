import React from "react";

import { mountWithStore, getFormValues } from "__support__/integration_tests";

import UserSettings from "metabase/user/components/UserSettings";

const MOCK_USER = {
  first_name: "Testy",
  last_name: "McTestFace",
  email: "test@metabase.com",
};

describe("UserSettings", () => {
  it("should show user info", async () => {
    const { wrapper, store } = mountWithStore(
      <UserSettings user={MOCK_USER} />,
    );

    console.log(wrapper.debug());

    console.log(store);
    expect(await getFormValues(wrapper)).toEqual(MOCK_USER);
  });
});
