import React from "react";
import { shallow } from "enzyme";
import ProfileLink from "metabase/nav/components/ProfileLink";

jest.mock("metabase/lib/settings", () => ({
  get: () => ({
    tag: 1,
    version: 1,
  }),
}));

describe("ProfileLink", () => {
  describe("options", () => {
    describe("normal user", () => {
      it("should show the proper set of items", () => {
        const normalUser = { is_superuser: false };
        const wrapper = shallow(<ProfileLink user={normalUser} context={""} />);

        expect(wrapper.instance().generateOptionsForUser().length).toBe(4);
      });
    });
    describe("admin", () => {
      it("should show the proper set of items", () => {
        const admin = { is_superuser: true };
        const wrapper = shallow(<ProfileLink user={admin} context={""} />);

        expect(wrapper.instance().generateOptionsForUser().length).toBe(6);
      });
    });
  });
});
