import React from "react";

import { getFormValues } from "__support__/enzyme_utils";
import { mountWithStore } from "__support__/integration_tests";

import UserSettings from "metabase/user/components/UserSettings";

const MOCK_USER = {
  first_name: "Testy",
  last_name: "McTestFace",
  email: "test@metabase.com",
};

describe("UserSettings", () => {
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
});
