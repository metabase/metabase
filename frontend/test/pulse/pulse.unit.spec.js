import React from "react";
import { shallow } from "enzyme";

import {
  KEYCODE_DOWN,
  KEYCODE_TAB,
  KEYCODE_ENTER,
  KEYCODE_COMMA,
} from "metabase/lib/keyboard";

import Input from "metabase/components/Input";
import UserAvatar from "metabase/components/UserAvatar";
import RecipientPicker from "metabase/pulse/components/RecipientPicker";

// We have to do some mocking here to avoid calls to GA and to Metabase settings
jest.mock("metabase/lib/settings", () => ({
  get: () => "v",
}));

global.ga = jest.fn();

const TEST_USERS = [
  { id: 1, common_name: "Barb", email: "barb_holland@hawkins.mail" }, // w
  { id: 2, common_name: "Dustin", email: "dustin_henderson@hawkinsav.club" }, // w
  { id: 3, common_name: "El", email: "011@energy.gov" },
  { id: 4, common_name: "Lucas", email: "lucas.sinclair@hawkins.mail" }, // w
  { id: 5, common_name: "Mike", email: "dm_mike@hawkins.mail" }, // w
  { id: 6, common_name: "Nancy", email: "" },
  { id: 7, common_name: "Steve", email: "" },
  { id: 8, common_name: "Will", email: "zombieboy@upside.down" }, // w
];

describe("recipient picker", () => {
  describe("focus", () => {
    it("should be focused if there are no recipients", () => {
      const wrapper = shallow(
        <RecipientPicker
          recipients={[]}
          users={TEST_USERS}
          isNewPulse={true}
          onRecipientsChange={() => alert("why?")}
        />,
      );

      expect(wrapper.state().focused).toBe(true);
    });
    it("should not be focused if there are existing recipients", () => {
      const wrapper = shallow(
        <RecipientPicker
          recipients={[TEST_USERS[0]]}
          users={TEST_USERS}
          isNewPulse={true}
          onRecipientsChange={() => alert("why?")}
        />,
      );

      expect(wrapper.state().focused).toBe(false);
    });
  });
  describe("filtering", () => {
    it("should properly filter users based on input", () => {
      const wrapper = shallow(
        <RecipientPicker
          recipients={[]}
          users={TEST_USERS}
          isNewPulse={true}
          onRecipientsChange={() => alert("why?")}
        />,
      );

      const spy = jest.spyOn(wrapper.instance(), "setInputValue");
      const input = wrapper.find(Input);

      // we should start off with no users
      expect(wrapper.state().filteredUsers.length).toBe(0);

      // simulate typing 'w'
      input.simulate("change", { target: { value: "w" } });

      expect(spy).toHaveBeenCalled();
      expect(wrapper.state().inputValue).toEqual("w");

      // 5 of the test users have a w in their name or email
      expect(wrapper.state().filteredUsers.length).toBe(5);
    });
  });

  describe("recipient selection", () => {
    it("should allow the user to click to select a recipient", () => {
      const spy = jest.fn();
      const wrapper = shallow(
        <RecipientPicker
          recipients={[]}
          users={TEST_USERS}
          isNewPulse={true}
          onRecipientsChange={spy}
        />,
      );

      const input = wrapper.find(Input);

      // limit our options to one user by typing
      input.simulate("change", { target: { value: "steve" } });
      expect(wrapper.state().filteredUsers.length).toBe(1);

      const user = wrapper.find(UserAvatar).closest("li");
      user.simulate("click", { target: {} });

      expect(spy).toHaveBeenCalled();
    });

    describe("key selection", () => {
      [KEYCODE_TAB, KEYCODE_ENTER, KEYCODE_COMMA].map(key =>
        it(`should allow the user to use arrow keys and then ${key} to select a recipient`, () => {
          const spy = jest.fn();

          const wrapper = shallow(
            <RecipientPicker
              recipients={[]}
              users={TEST_USERS}
              isNewPulse={true}
              onRecipientsChange={spy}
            />,
          );

          const input = wrapper.find(Input);

          // limit our options to  user by typing
          input.simulate("change", { target: { value: "w" } });

          // the initially selected user should be the first user
          expect(wrapper.state().selectedUserID).toBe(TEST_USERS[0].id);

          input.simulate("keyDown", {
            keyCode: KEYCODE_DOWN,
            preventDefault: jest.fn(),
          });

          // the next possible user should be selected now
          expect(wrapper.state().selectedUserID).toBe(TEST_USERS[1].id);

          input.simulate("keydown", {
            keyCode: key,
            preventDefalut: jest.fn(),
          });

          expect(spy).toHaveBeenCalledTimes(1);
          expect(spy).toHaveBeenCalledWith([TEST_USERS[1]]);
        }),
      );
    });

    describe("usage", () => {
      it("should all work good", () => {
        class TestComponent extends React.Component {
          state = {
            recipients: [],
          };

          render() {
            const { recipients } = this.state;
            return (
              <RecipientPicker
                recipients={recipients}
                users={TEST_USERS}
                isNewPulse={true}
                onRecipientsChange={recipients => {
                  this.setState({ recipients });
                }}
              />
            );
          }
        }
        const wrapper = shallow(<TestComponent />);

        // something about the popover code makes it not work with mount
        // in the test env, so we have to use shallow and  dive here to
        // actually get  the selection list to render anything that we
        // can interact with
        const picker = wrapper.find(RecipientPicker).dive();

        const input = picker.find(Input);
        input.simulate("change", { target: { value: "will" } });

        const user = picker.find(UserAvatar).closest("li");
        user.simulate("click", { target: {} });

        // there should be one user selected
        expect(wrapper.state().recipients.length).toBe(1);

        // grab the updated state of RecipientPicker
        const postAddPicker = wrapper.find(RecipientPicker).dive();

        // there should only be one user in the picker now , "Will" and then the input
        // so there will be two list items
        expect(postAddPicker.find("li").length).toBe(2);
      });
    });
  });
});
