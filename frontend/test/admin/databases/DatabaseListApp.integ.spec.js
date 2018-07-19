import {
  useSharedAdminLogin,
  createTestStore,
  eventually,
} from "__support__/integrated_tests";
import { click, clickButton, setInputValue } from "__support__/enzyme_utils";

import { mount } from "enzyme";
import {
  initializeDatabase,
  INITIALIZE_DATABASE,
  DELETE_DATABASE_FAILED,
  CREATE_DATABASE_STARTED,
  CREATE_DATABASE_FAILED,
  UPDATE_DATABASE_STARTED,
  UPDATE_DATABASE_FAILED,
  UPDATE_DATABASE,
  VALIDATE_DATABASE_STARTED,
  SET_DATABASE_CREATION_STEP,
  VALIDATE_DATABASE_FAILED,
} from "metabase/admin/databases/database";

import DatabaseListApp from "metabase/admin/databases/containers/DatabaseListApp";

import { MetabaseApi } from "metabase/services";
import DatabaseEditApp from "metabase/admin/databases/containers/DatabaseEditApp";
import { delay } from "metabase/lib/promise";
import { getEditingDatabase } from "metabase/admin/databases/selectors";
import FormMessage, {
  SERVER_ERROR_MESSAGE,
} from "metabase/components/form/FormMessage";
import CreatedDatabaseModal from "metabase/admin/databases/components/CreatedDatabaseModal";
import FormField from "metabase/components/form/FormField";
import Toggle from "metabase/components/Toggle";
import DatabaseSchedulingForm, {
  SyncOption,
} from "metabase/admin/databases/components/DatabaseSchedulingForm";

import Databases from "metabase/entities/databases";

describe("dashboard list", () => {
  beforeAll(async () => {
    useSharedAdminLogin();
  });

  it("should render", async () => {
    const store = await createTestStore();
    store.pushPath("/admin/databases");

    const app = mount(store.getAppContainer());

    await store.waitForActions([Databases.actionTypes.FETCH_LIST]);

    expect(app.find(DatabaseListApp).length).toEqual(1);
  });

  describe("adds", () => {
    it("should work and shouldn't let you accidentally add db twice", async () => {
      Databases.api.create = async db => {
        await delay(10);
        return { ...db, id: 10 };
      };

      const store = await createTestStore();
      store.pushPath("/admin/databases");

      const app = mount(store.getAppContainer());

      await eventually(() => {
        click(app.find(".Button.Button--primary").first());
      });

      const dbDetailsForm = app.find(DatabaseEditApp);
      expect(dbDetailsForm.length).toBe(1);

      await store.waitForActions([INITIALIZE_DATABASE]);

      expect(
        dbDetailsForm.find('button[children="Save"]').props().disabled,
      ).toBe(true);

      const updateInputValue = (name, value) =>
        setInputValue(dbDetailsForm.find(`input[name="${name}"]`), value);

      updateInputValue("name", "Test db name");
      updateInputValue("dbname", "test_postgres_db");
      updateInputValue("user", "uberadmin");

      const saveButton = dbDetailsForm.find('button[children="Save"]');

      expect(saveButton.props().disabled).toBe(false);
      clickButton(saveButton);

      // Now the submit button should be disabled so that you aren't able to trigger the db creation action twice
      await store.waitForActions([CREATE_DATABASE_STARTED]);
      expect(saveButton.text()).toBe("Saving...");
      expect(saveButton.props().disabled).toBe(true);

      await eventually(() =>
        expect(store.getPath()).toEqual("/admin/databases?created=10"),
      );
      expect(app.find(CreatedDatabaseModal).length).toBe(1);
    });

    it("should show validation error if you enable scheduling toggle and enter invalid db connection info", async () => {
      Databases.api.create = async db => {
        await delay(10);
        return { ...db, id: 10 };
      };

      const store = await createTestStore();
      store.pushPath("/admin/databases");

      const app = mount(store.getAppContainer());

      await eventually(() => {
        click(app.find(".Button.Button--primary").first());
      });

      const dbDetailsForm = app.find(DatabaseEditApp);
      expect(dbDetailsForm.length).toBe(1);

      await store.waitForActions([INITIALIZE_DATABASE]);

      expect(
        dbDetailsForm.find('button[children="Save"]').props().disabled,
      ).toBe(true);

      const updateInputValue = (name, value) =>
        setInputValue(dbDetailsForm.find(`input[name="${name}"]`), value);

      updateInputValue("name", "Test db name");
      updateInputValue("dbname", "test_postgres_db");
      updateInputValue("user", "uberadmin");

      const letUserControlSchedulingField = dbDetailsForm
        .find(FormField)
        .filterWhere(
          f => f.props().fieldName === "let-user-control-scheduling",
        );
      expect(letUserControlSchedulingField.length).toBe(1);
      expect(letUserControlSchedulingField.find(Toggle).props().value).toBe(
        false,
      );
      click(letUserControlSchedulingField.find(Toggle));

      const nextStepButton = dbDetailsForm.find('button[children="Next"]');
      expect(nextStepButton.props().disabled).toBe(false);
      clickButton(nextStepButton);

      await store.waitForActions([
        VALIDATE_DATABASE_STARTED,
        VALIDATE_DATABASE_FAILED,
      ]);
      expect(app.find(FormMessage).text()).toMatch(
        /Couldn't connect to the database./,
      );
    });

    it("should direct you to scheduling settings if you enable the toggle", async () => {
      Databases.api.create = async db => {
        await delay(10);
        return { ...db, id: 10 };
      };
      // mock the validate API now because we need a positive response
      // TODO Atte Keinänen 8/17/17: Could we at some point connect to some real H2 instance here?
      // Maybe the test fixture would be a good fit as tests are anyway using a copy of it (no connection conflicts expected)
      MetabaseApi.db_validate = async db => {
        await delay(10);
        return { valid: true };
      };

      const store = await createTestStore();
      store.pushPath("/admin/databases");

      const app = mount(store.getAppContainer());
      await store.waitForActions([Databases.actionTypes.FETCH_LIST]);

      await eventually(() => {
        click(app.find(".Button.Button--primary").first());
      });

      const dbDetailsForm = app.find(DatabaseEditApp);
      expect(dbDetailsForm.length).toBe(1);

      await store.waitForActions([INITIALIZE_DATABASE]);

      expect(
        dbDetailsForm.find('button[children="Save"]').props().disabled,
      ).toBe(true);

      const updateInputValue = (name, value) =>
        setInputValue(dbDetailsForm.find(`input[name="${name}"]`), value);

      updateInputValue("name", "Test db name");
      updateInputValue("dbname", "test_postgres_db");
      updateInputValue("user", "uberadmin");

      const letUserControlSchedulingField = dbDetailsForm
        .find(FormField)
        .filterWhere(
          f => f.props().fieldName === "let-user-control-scheduling",
        );
      expect(letUserControlSchedulingField.length).toBe(1);
      expect(letUserControlSchedulingField.find(Toggle).props().value).toBe(
        false,
      );
      click(letUserControlSchedulingField.find(Toggle));

      const nextStepButton = dbDetailsForm.find('button[children="Next"]');
      expect(nextStepButton.props().disabled).toBe(false);
      clickButton(nextStepButton);

      await store.waitForActions([
        VALIDATE_DATABASE_STARTED,
        SET_DATABASE_CREATION_STEP,
      ]);

      // Change the sync period to never in scheduling settings
      const schedulingForm = app.find(DatabaseSchedulingForm);
      expect(schedulingForm.length).toBe(1);
      const syncOptions = schedulingForm.find(SyncOption);
      const syncOptionsNever = syncOptions.at(1);
      expect(syncOptionsNever.props().selected).toEqual(false);
      click(syncOptionsNever);
      expect(syncOptionsNever.props().selected).toEqual(true);

      const saveButton = dbDetailsForm.find('button[children="Save"]');
      expect(saveButton.props().disabled).toBe(false);
      clickButton(saveButton);

      // Now the submit button should be disabled so that you aren't able to trigger the db creation action twice
      await store.waitForActions([CREATE_DATABASE_STARTED]);
      expect(saveButton.text()).toBe("Saving...");

      await eventually(() =>
        expect(store.getPath()).toEqual("/admin/databases?created=10"),
      );

      expect(app.find(CreatedDatabaseModal).length).toBe(1);
    });

    it("should show error correctly on failure", async () => {
      Databases.api.create = async () => {
        await delay(10);
        return Promise.reject({
          status: 400,
          data: {},
          isCancelled: false,
        });
      };

      const store = await createTestStore();
      store.pushPath("/admin/databases");

      const app = mount(store.getAppContainer());

      await eventually(() => {
        const addDbButton = app.find(".Button.Button--primary").first();
        expect(addDbButton).not.toBe(null);
        click(addDbButton);
      });

      const dbDetailsForm = app.find(DatabaseEditApp);
      expect(dbDetailsForm.length).toBe(1);

      await store.waitForActions([INITIALIZE_DATABASE]);

      const saveButton = dbDetailsForm.find('button[children="Save"]');
      expect(saveButton.props().disabled).toBe(true);

      // TODO: Apply change method here
      const updateInputValue = (name, value) =>
        setInputValue(dbDetailsForm.find(`input[name="${name}"]`), value);

      updateInputValue("name", "Test db name");
      updateInputValue("dbname", "test_postgres_db");
      updateInputValue("user", "uberadmin");

      // TODO: Apply button submit thing here
      expect(saveButton.props().disabled).toBe(false);
      clickButton(saveButton);

      await store.waitForActions([CREATE_DATABASE_STARTED]);
      expect(saveButton.text()).toBe("Saving...");

      await store.waitForActions([CREATE_DATABASE_FAILED]);
      expect(dbDetailsForm.find(FormMessage).text()).toEqual(
        SERVER_ERROR_MESSAGE,
      );
      expect(saveButton.text()).toBe("Save");
    });
  });

  describe("deletes", () => {
    it("should not block deletes", async () => {
      Databases.api.delete = async () => {
        await delay(10);
      };

      const store = await createTestStore();
      store.pushPath("/admin/databases");

      const app = mount(store.getAppContainer());

      let deleteButtons;
      await eventually(() => {
        deleteButtons = app.find(".Button.Button--danger");
        expect(deleteButtons).not.toHaveLength(0);
      });

      // let dbCount = deleteButtons.length;
      click(deleteButtons.first());

      const deleteModal = app.find(".test-modal");
      setInputValue(deleteModal.find(".Form-input"), "DELETE");
      clickButton(deleteModal.find(".Button.Button--danger"));

      // test that the modal is gone
      expect(app.find(".test-modal").length).toEqual(0);

      // we should now have a disabled db row during delete
      expect(app.find("tr.disabled").length).toEqual(1);

      await eventually(() => {
        // there should be no disabled db rows now
        expect(app.find("tr.disabled").length).toEqual(0);

        // we should now have one database less in the list
        // NOTE: unsure why the delete button is still present, it is not during manual testing
        // expect(app.find(".Button.Button--danger").length).toEqual(dbCount - 1);
      });
    });

    it("should show error correctly on failure", async () => {
      Databases.api.delete = async () => {
        await delay(10);
        return Promise.reject({
          status: 400,
          data: {},
          isCancelled: false,
        });
      };

      const store = await createTestStore();
      store.pushPath("/admin/databases");

      const app = mount(store.getAppContainer());

      let deleteButtons;
      await eventually(() => {
        deleteButtons = app.find(".Button.Button--danger");
        expect(deleteButtons).not.toHaveLength(0);
      });

      let dbCount = deleteButtons.length;
      click(deleteButtons.first());

      const deleteModal = app.find(".test-modal");
      setInputValue(deleteModal.find(".Form-input"), "DELETE");
      clickButton(deleteModal.find(".Button.Button--danger"));

      // test that the modal is gone
      expect(app.find(".test-modal").length).toEqual(0);

      // we should now have a disabled db row during delete
      expect(app.find("tr.disabled").length).toEqual(1);

      // db delete fails
      await store.waitForActions([DELETE_DATABASE_FAILED]);

      // there should be no disabled db rows now
      expect(app.find("tr.disabled").length).toEqual(0);

      // the db count should be same as before
      expect(app.find(".Button.Button--danger")).toHaveLength(dbCount);

      expect(app.find(FormMessage).text()).toBe(SERVER_ERROR_MESSAGE);
    });
  });

  describe("editing", () => {
    const newName = "Ex-Sample Data Set";

    it("should be able to edit database name", async () => {
      const store = await createTestStore();
      store.pushPath("/admin/databases");

      const app = mount(store.getAppContainer());
      await store.waitForActions([Databases.actionTypes.FETCH_LIST]);

      await eventually(() =>
        click(app.find('a[children="Sample Dataset"]').first()),
      );

      expect(store.getPath()).toEqual("/admin/databases/1");
      await store.waitForActions([INITIALIZE_DATABASE]);

      const dbDetailsForm = app.find(DatabaseEditApp);
      expect(dbDetailsForm.length).toBe(1);

      const nameField = dbDetailsForm.find(`input[name="name"]`);
      expect(nameField.props().value).toEqual("Sample Dataset");

      setInputValue(nameField, newName);

      const saveButton = dbDetailsForm.find('button[children="Save"]');
      clickButton(saveButton);

      await store.waitForActions([UPDATE_DATABASE_STARTED]);
      expect(saveButton.text()).toBe("Saving...");
      expect(saveButton.props().disabled).toBe(true);

      await store.waitForActions([UPDATE_DATABASE]);
      expect(saveButton.props().disabled).toBe(undefined);
      expect(dbDetailsForm.find(FormMessage).text()).toEqual(
        "Successfully saved!",
      );
    });

    it("should show the updated database name", async () => {
      const store = await createTestStore();
      store.pushPath("/admin/databases/1");

      const app = mount(store.getAppContainer());
      await store.waitForActions([INITIALIZE_DATABASE]);

      const dbDetailsForm = app.find(DatabaseEditApp);
      expect(dbDetailsForm.length).toBe(1);

      const nameField = dbDetailsForm.find(`input[name="name"]`);
      expect(nameField.props().value).toEqual(newName);
    });

    it("should show an error if saving fails", async () => {
      const store = await createTestStore();
      store.pushPath("/admin/databases/1");

      const app = mount(store.getAppContainer());
      await store.waitForActions([INITIALIZE_DATABASE]);

      const dbDetailsForm = app.find(DatabaseEditApp);
      expect(dbDetailsForm.length).toBe(1);

      const tooLongName = "too long name ".repeat(100);
      const nameField = dbDetailsForm.find(`input[name="name"]`);
      setInputValue(nameField, tooLongName);

      const saveButton = dbDetailsForm.find('button[children="Save"]');
      clickButton(saveButton);

      await store.waitForActions([UPDATE_DATABASE_STARTED]);
      expect(saveButton.text()).toBe("Saving...");
      expect(saveButton.props().disabled).toBe(true);

      await store.waitForActions([UPDATE_DATABASE_FAILED]);
      expect(saveButton.props().disabled).toBe(undefined);
      expect(dbDetailsForm.find(".Form-message.text-error").length).toBe(1);
    });

    afterAll(async () => {
      const store = await createTestStore();
      store.dispatch(initializeDatabase(1));
      await store.waitForActions([INITIALIZE_DATABASE]);
      const sampleDatasetDb = getEditingDatabase(store.getState());

      await MetabaseApi.db_update({
        ...sampleDatasetDb,
        name: "Sample Dataset",
      });
    });
  });
});
