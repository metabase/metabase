// Converted from a Selenium E2E test
import {
  createTestStore,
  useSharedAdminLogin,
} from "__support__/integrated_tests";
import { click, clickButton, setInputValue } from "__support__/enzyme_utils";
import { mount } from "enzyme";
import {
  CREATE_MEMBERSHIP,
  CREATE_USER,
  FETCH_USERS,
  LOAD_GROUPS,
  LOAD_MEMBERSHIPS,
  SHOW_MODAL,
  UPDATE_USER,
} from "metabase/admin/people/people";
import ModalContent from "metabase/components/ModalContent";
import { delay } from "metabase/lib/promise";
import Button from "metabase/components/Button";
import { getUsers } from "metabase/admin/people/selectors";
import UserGroupSelect from "metabase/admin/people/components/UserGroupSelect";
import { GroupOption } from "metabase/admin/people/components/GroupSelect";
import { UserApi } from "metabase/services";
import UserActionsSelect from "metabase/admin/people/components/UserActionsSelect";

describe("admin/people", () => {
  let createdUserId = null;

  beforeAll(async () => {
    useSharedAdminLogin();
  });

  describe("user management", () => {
    it("should allow admin to create new users", async () => {
      const store = await createTestStore();
      store.pushPath("/admin/people");
      const app = mount(store.getAppContainer());
      await store.waitForActions([FETCH_USERS, LOAD_GROUPS, LOAD_MEMBERSHIPS]);

      const email =
        "testy" + Math.round(Math.random() * 10000) + "@metabase.com";
      const firstName = "Testy";
      const lastName = "McTestFace";

      click(app.find('button[children="Add someone"]'));
      await store.waitForActions([SHOW_MODAL]);
      await delay(1000);

      const addUserModal = app.find(ModalContent);
      const addButton = addUserModal
        .find('div[children="Add"]')
        .closest(Button);
      expect(addButton.props().disabled).toBe(true);

      setInputValue(addUserModal.find("input[name='firstName']"), firstName);
      setInputValue(addUserModal.find("input[name='lastName']"), lastName);
      setInputValue(addUserModal.find("input[name='email']"), email);

      expect(addButton.props().disabled).toBe(false);
      clickButton(addButton);

      await store.waitForActions([CREATE_USER]);
      // unsure why a small delay is required here
      await delay(100);

      // it should be a pretty safe assumption in test environment that the user that was just created has the biggest ID
      const userIds = Object.keys(getUsers(store.getState()));
      createdUserId = Math.max.apply(null, userIds.map(key => parseInt(key)));

      click(addUserModal.find('a[children="Show"]'));
      const password = addUserModal.find("input").prop("value");

      // "Done" button
      click(addUserModal.find(".Button.Button--primary"));

      const usersTable = app.find(".ContentTable");
      const userRow = usersTable.find(`td[children="${email}"]`).closest("tr");
      expect(
        userRow
          .find("td")
          .first()
          .find("span")
          .last()
          .text(),
      ).toBe(`${firstName} ${lastName}`);

      // add admin permissions
      const userGroupSelect = userRow.find(UserGroupSelect);
      expect(userGroupSelect.text()).toBe("Default");
      click(userGroupSelect);

      click(
        app
          .find(".TestPopover")
          .find(GroupOption)
          .first(),
      );
      await store.waitForActions([CREATE_MEMBERSHIP]);

      // edit user details
      click(userRow.find(UserActionsSelect));
      click(app.find(".TestPopover").find('li[children="Edit Details"]'));

      const editDetailsModal = app.find(ModalContent);

      const saveButton = editDetailsModal
        .find('div[children="Save changes"]')
        .closest(Button);
      expect(saveButton.props().disabled).toBe(true);

      setInputValue(
        editDetailsModal.find("input[name='firstName']"),
        firstName + "x",
      );
      setInputValue(
        editDetailsModal.find("input[name='lastName']"),
        lastName + "x",
      );
      setInputValue(editDetailsModal.find("input[name='email']"), email + "x");
      expect(saveButton.props().disabled).toBe(false);

      await clickButton(saveButton);
      await store.waitForActions([UPDATE_USER]);

      const updatedUserRow = usersTable
        .find(`td[children="${email}x"]`)
        .closest("tr");
      expect(
        updatedUserRow
          .find("td")
          .first()
          .find("span")
          .last()
          .text(),
      ).toBe(`${firstName}x ${lastName}x`);

      click(userRow.find(UserActionsSelect));
      click(app.find(".TestPopover").find('li[children="Reset Password"]'));

      const resetPasswordModal = app.find(ModalContent);
      const resetButton = resetPasswordModal
        .find('div[children="Reset"]')
        .closest(Button);
      click(resetButton);
      click(resetPasswordModal.find('a[children="Show"]'));
      const newPassword = resetPasswordModal.find("input").prop("value");

      expect(newPassword).not.toEqual(password);
    });

    afterAll(async () => {
      // Test cleanup
      if (createdUserId) {
        await UserApi.delete({ userId: createdUserId });
      }
    });
  });
});
