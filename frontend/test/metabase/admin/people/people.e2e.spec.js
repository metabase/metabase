// Converted from a Selenium E2E test
import {
  createTestStore,
  useSharedAdminLogin,
  BROWSER_HISTORY_PUSH,
  BROWSER_HISTORY_POP,
} from "__support__/e2e";
import {
  click,
  clickButton,
  setInputValue,
  findButtonByText,
} from "__support__/enzyme";
import { mount } from "enzyme";
import {
  CREATE_MEMBERSHIP,
  LOAD_MEMBERSHIPS,
} from "metabase/admin/people/people";
import ModalContent from "metabase/components/ModalContent";
import { delay } from "metabase/lib/promise";
import { getUsersWithMemberships } from "metabase/admin/people/selectors";
import UserGroupSelect from "metabase/admin/people/components/UserGroupSelect";
import { GroupOption } from "metabase/admin/people/components/GroupSelect";
import { UserApi } from "metabase/services";

import User, { PASSWORD_RESET_MANUAL } from "metabase/entities/users";
import Group from "metabase/entities/groups";

import EntityMenuTrigger from "metabase/components/EntityMenuTrigger";
import EntityMenuItem from "metabase/components/EntityMenuItem";

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

      await store.waitForActions([
        User.actionTypes.FETCH_LIST,
        Group.actionTypes.FETCH_LIST,
        LOAD_MEMBERSHIPS,
      ]);

      const email =
        "testy" + Math.round(Math.random() * 10000) + "@metabase.com";
      const firstName = "Testy";
      const lastName = "McTestFace";

      clickButton(app.find(".Button.Button--primary"));
      await store.waitForActions([BROWSER_HISTORY_PUSH]);

      const addUserModal = app.find(ModalContent);
      const addButton = addUserModal.find(".Button[type='submit']");
      expect(addButton.props().disabled).toBe(true);

      setInputValue(addUserModal.find("input[name='first_name']"), firstName);
      setInputValue(addUserModal.find("input[name='last_name']"), lastName);
      setInputValue(addUserModal.find("input[name='email']"), email);

      expect(addButton.props().disabled).toBe(false);
      clickButton(addButton);

      await store.waitForActions([
        "metabase/entities/users/CREATE",
        BROWSER_HISTORY_PUSH,
      ]);

      await delay(100);

      // it should be a pretty safe assumption in test environment that the user that was just created has the biggest ID
      const userIds = Object.keys(getUsersWithMemberships(store.getState()));
      createdUserId = Math.max.apply(null, userIds.map(key => parseInt(key)));

      const userCreatedModal = app.find(ModalContent);

      click(userCreatedModal.find('[children="Show"]'));
      const password = userCreatedModal.find("input").prop("value");

      // "Done" button
      click(userCreatedModal.find(".Button.Button--primary"));

      await store.waitForActions([BROWSER_HISTORY_PUSH]);

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

      click(userRow.find(EntityMenuTrigger));
      click(app.find(EntityMenuItem).find('span[children="Edit user"]'));

      await store.waitForActions([BROWSER_HISTORY_PUSH]);

      const editDetailsModal = app.find(ModalContent);

      const saveButton = findButtonByText(app, "Update");

      setInputValue(
        editDetailsModal.find("input[name='first_name']"),
        firstName + "x",
      );
      setInputValue(
        editDetailsModal.find("input[name='last_name']"),
        lastName + "x",
      );
      setInputValue(editDetailsModal.find("input[name='email']"), email + "x");
      expect(saveButton.props().disabled).toBe(false);

      clickButton(saveButton);
      await store.waitForActions([
        "metabase/entities/users/UPDATE",
        BROWSER_HISTORY_POP,
      ]);

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

      click(userRow.find(EntityMenuTrigger));
      click(app.find(EntityMenuItem).find('span[children="Reset password"]'));

      await store.waitForActions([BROWSER_HISTORY_PUSH]);

      const resetPasswordModal = app.find(ModalContent);
      clickButton(resetPasswordModal.find(".Button.Button--danger"));

      await store.waitForActions([PASSWORD_RESET_MANUAL]);

      // this assumes no email configured
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
