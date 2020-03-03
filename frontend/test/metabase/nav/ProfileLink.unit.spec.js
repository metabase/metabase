import React from "react";
import { shallow } from "enzyme";
import ProfileLink from "metabase/nav/components/ProfileLink";

describe("ProfileLink", () => {
  describe("options", () => {
    describe("normal user", () => {
      it("should show the proper set of items", () => {
        const normalUser = { is_superuser: false };
        const wrapper = shallow(<ProfileLink user={normalUser} context={""} />);

        expect(
          wrapper
            .instance()
            .generateOptionsForUser()
            .map(o => o.title),
        ).toEqual([
          "Account settings",
          "Activity",
          "Help",
          "About Metabase",
          "Sign out",
        ]);
      });
    });
    describe("admin", () => {
      it("should show the proper set of items", () => {
        const admin = { is_superuser: true };
        const wrapper = shallow(<ProfileLink user={admin} context={""} />);

        expect(
          wrapper
            .instance()
            .generateOptionsForUser()
            .map(o => o.title),
        ).toEqual([
          "Account settings",
          "Admin",
          "Activity",
          "Help",
          "About Metabase",
          "Sign out",
        ]);
      });
    });
  });
});
