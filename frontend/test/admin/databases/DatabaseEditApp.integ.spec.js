import {
  useSharedAdminLogin,
  createTestStore,
} from "__support__/integrated_tests";

import React from "react";
import { mount } from "enzyme";
import {
  INITIALIZE_DATABASE,
  RESCAN_DATABASE_FIELDS,
  SYNC_DATABASE_SCHEMA,
  DISCARD_SAVED_FIELD_VALUES,
  UPDATE_DATABASE,
  MIGRATE_TO_NEW_SCHEDULING_SETTINGS,
  DEFAULT_SCHEDULES,
} from "metabase/admin/databases/database";
import DatabaseEditApp from "metabase/admin/databases/containers/DatabaseEditApp";
import DatabaseEditForms from "metabase/admin/databases/components/DatabaseEditForms";
import DatabaseSchedulingForm, {
  SyncOption,
} from "metabase/admin/databases/components/DatabaseSchedulingForm";
import FormField from "metabase/components/form/FormField";
import Toggle from "metabase/components/Toggle";
import { TestModal } from "metabase/components/Modal";
import Select from "metabase/components/Select";
import ColumnarSelector from "metabase/components/ColumnarSelector";
import Radio from "metabase/components/Radio";
import { click, clickButton } from "__support__/enzyme_utils";
import { MetabaseApi } from "metabase/services";
import _ from "underscore";

// NOTE ATTE KEINÄNEN 8/17/17:
// This test suite has overlap (albeit intentional) with both DatabaseListApp.integ.spec and signup.integ.spec

// Currently a lot of duplication with SegmentPane tests
describe("DatabaseEditApp", () => {
  beforeAll(async () => {
    useSharedAdminLogin();
  });

  describe("Connection tab", () => {
    it("shows the connection settings for sample dataset correctly", async () => {
      const store = await createTestStore();
      store.pushPath("/admin/databases/1");
      const dbEditApp = mount(store.connectContainer(<DatabaseEditApp />));
      await store.waitForActions([INITIALIZE_DATABASE]);

      const editForm = dbEditApp.find(DatabaseEditForms);
      expect(editForm.length).toBe(1);
      expect(editForm.find("select").props().defaultValue).toBe("h2");
      expect(editForm.find('input[name="name"]').props().value).toBe(
        "Sample Dataset",
      );
      expect(editForm.find('input[name="db"]').props().value).toEqual(
        expect.stringContaining("sample-dataset.db;USER=GUEST;PASSWORD=guest"),
      );
    });

    it("lets you modify the connection settings", async () => {
      const store = await createTestStore();
      store.pushPath("/admin/databases/1");
      const dbEditApp = mount(store.connectContainer(<DatabaseEditApp />));
      await store.waitForActions([INITIALIZE_DATABASE]);

      const editForm = dbEditApp.find(DatabaseEditForms);
      const letUserControlSchedulingField = editForm
        .find(FormField)
        .filterWhere(
          f => f.props().fieldName === "let-user-control-scheduling",
        );
      expect(letUserControlSchedulingField.find(Toggle).props().value).toBe(
        false,
      );
      click(letUserControlSchedulingField.find(Toggle));

      // Connection and Scheduling tabs shouldn't be visible yet
      expect(dbEditApp.find(Radio).find("li").length).toBe(0);

      clickButton(editForm.find('button[children="Save"]'));

      await store.waitForActions([UPDATE_DATABASE]);

      // Tabs should be now visible as user-controlled scheduling is enabled
      expect(dbEditApp.find(Radio).find("li").length).toBe(2);
    });

    // NOTE Atte Keinänen 8/17/17: See migrateDatabaseToNewSchedulingSettings for more information about migration process
    it("shows the analysis toggle correctly for non-migrated analysis settings when `is_full_sync` is true", async () => {
      // Set is_full_sync to false here inline and remove the let-user-control-scheduling setting
      const database = await MetabaseApi.db_get({ dbId: 1 });
      await MetabaseApi.db_update({
        ...database,
        is_full_sync: true,
        details: _.omit(database.details, "let-user-control-scheduling"),
      });

      const store = await createTestStore();
      store.pushPath("/admin/databases/1");
      const dbEditApp = mount(store.connectContainer(<DatabaseEditApp />));
      await store.waitForActions([
        INITIALIZE_DATABASE,
        MIGRATE_TO_NEW_SCHEDULING_SETTINGS,
      ]);

      const editForm = dbEditApp.find(DatabaseEditForms);
      expect(editForm.length).toBe(1);
      expect(editForm.find("select").props().defaultValue).toBe("h2");
      expect(editForm.find('input[name="name"]').props().value).toBe(
        "Sample Dataset",
      );
      expect(editForm.find('input[name="db"]').props().value).toEqual(
        expect.stringContaining("sample-dataset.db;USER=GUEST;PASSWORD=guest"),
      );

      const letUserControlSchedulingField = editForm
        .find(FormField)
        .filterWhere(
          f => f.props().fieldName === "let-user-control-scheduling",
        );
      expect(letUserControlSchedulingField.length).toBe(1);
      expect(letUserControlSchedulingField.find(Toggle).props().value).toBe(
        false,
      );
      expect(dbEditApp.find(Radio).find("li").length).toBe(0);
    });

    it("shows the analysis toggle correctly for non-migrated analysis settings when `is_full_sync` is false", async () => {
      // Set is_full_sync to true here inline and remove the let-user-control-scheduling setting
      const database = await MetabaseApi.db_get({ dbId: 1 });
      await MetabaseApi.db_update({
        ...database,
        is_full_sync: false,
        details: _.omit(database.details, "let-user-control-scheduling"),
      });

      // Start the actual interaction test
      const store = await createTestStore();
      store.pushPath("/admin/databases/1");
      const dbEditApp = mount(store.connectContainer(<DatabaseEditApp />));
      await store.waitForActions([
        INITIALIZE_DATABASE,
        MIGRATE_TO_NEW_SCHEDULING_SETTINGS,
      ]);

      const editForm = dbEditApp.find(DatabaseEditForms);
      const letUserControlSchedulingField = editForm
        .find(FormField)
        .filterWhere(
          f => f.props().fieldName === "let-user-control-scheduling",
        );
      expect(letUserControlSchedulingField.length).toBe(1);
      expect(letUserControlSchedulingField.find(Toggle).props().value).toBe(
        true,
      );
      expect(dbEditApp.find(Radio).find("li").length).toBe(2);
    });

    afterAll(async () => {
      // revert all changes that have been made
      // use a direct API call for the sake of simplicity / reliability
      const database = await MetabaseApi.db_get({ dbId: 1 });
      await MetabaseApi.db_update({
        ...database,
        is_full_sync: true,
        details: {
          ...database.details,
          "let-user-control-scheduling": false,
        },
      });
    });
  });

  describe("Scheduling tab", () => {
    beforeAll(async () => {
      // Enable the user-controlled scheduling for these tests
      const database = await MetabaseApi.db_get({ dbId: 1 });
      await MetabaseApi.db_update({
        ...database,
        details: {
          ...database.details,
          "let-user-control-scheduling": true,
        },
      });
    });

    it("shows the initial scheduling settings correctly", async () => {
      const store = await createTestStore();
      store.pushPath("/admin/databases/1");
      const dbEditApp = mount(store.connectContainer(<DatabaseEditApp />));
      await store.waitForActions([INITIALIZE_DATABASE]);

      const editForm = dbEditApp.find(DatabaseEditForms);
      expect(editForm.length).toBe(1);
      click(
        dbEditApp
          .find(Radio)
          .find("li")
          .last(),
      );

      const schedulingForm = dbEditApp.find(DatabaseSchedulingForm);
      expect(schedulingForm.length).toBe(1);

      expect(
        schedulingForm
          .find(Select)
          .first()
          .text(),
      ).toEqual("Hourly");

      const syncOptions = schedulingForm.find(SyncOption);
      const syncOptionOften = syncOptions.first();

      expect(syncOptionOften.props().name).toEqual("Regularly, on a schedule");
      expect(syncOptionOften.props().selected).toEqual(true);
    });

    it("lets you change the db sync period", async () => {
      const store = await createTestStore();

      store.pushPath("/admin/databases/1");
      const dbEditApp = mount(store.connectContainer(<DatabaseEditApp />));
      await store.waitForActions([INITIALIZE_DATABASE]);

      click(
        dbEditApp
          .find(Radio)
          .find("li")
          .last(),
      );
      const schedulingForm = dbEditApp.find(DatabaseSchedulingForm);
      const dbSyncSelect = schedulingForm.find(Select).first();
      click(dbSyncSelect);

      const dailyOption = schedulingForm
        .find(ColumnarSelector)
        .find("li")
        .at(1)
        .children();
      expect(dailyOption.text()).toEqual("Daily");
      click(dailyOption);

      expect(dbSyncSelect.text()).toEqual("Daily");

      clickButton(schedulingForm.find('button[children="Save changes"]'));

      await store.waitForActions([UPDATE_DATABASE]);
    });

    it("lets you change the table change frequency to Never", async () => {
      const store = await createTestStore();
      store.pushPath("/admin/databases/1");
      const dbEditApp = mount(store.connectContainer(<DatabaseEditApp />));
      await store.waitForActions([INITIALIZE_DATABASE]);

      click(
        dbEditApp
          .find(Radio)
          .find("li")
          .last(),
      );
      const schedulingForm = dbEditApp.find(DatabaseSchedulingForm);
      const dbSyncSelect = schedulingForm.find(Select).first();
      click(dbSyncSelect);

      const syncOptions = schedulingForm.find(SyncOption);
      const syncOptionsNever = syncOptions.at(1);

      expect(syncOptionsNever.props().selected).toEqual(false);
      click(syncOptionsNever);
      expect(syncOptionsNever.props().selected).toEqual(true);

      clickButton(schedulingForm.find('button[children="Save changes"]'));
      await store.waitForActions([UPDATE_DATABASE]);
    });

    it("shows the modified scheduling settings correctly", async () => {
      const store = await createTestStore();
      store.pushPath("/admin/databases/1");
      const dbEditApp = mount(store.connectContainer(<DatabaseEditApp />));
      await store.waitForActions([INITIALIZE_DATABASE]);

      click(
        dbEditApp
          .find(Radio)
          .find("li")
          .last(),
      );
      const schedulingForm = dbEditApp.find(DatabaseSchedulingForm);
      expect(schedulingForm.length).toBe(1);

      expect(
        schedulingForm
          .find(Select)
          .first()
          .text(),
      ).toEqual("Daily");

      const syncOptions = schedulingForm.find(SyncOption);
      const syncOptionOften = syncOptions.first();
      const syncOptionNever = syncOptions.at(1);
      expect(syncOptionOften.props().selected).toEqual(false);
      expect(syncOptionNever.props().selected).toEqual(true);
    });

    afterAll(async () => {
      // revert all changes that have been made
      const database = await MetabaseApi.db_get({ dbId: 1 });
      await MetabaseApi.db_update({
        ...database,
        is_full_sync: true,
        schedules: DEFAULT_SCHEDULES,
        details: {
          ...database.details,
          "let-user-control-scheduling": false,
        },
      });
    });
  });

  describe("Actions sidebar", () => {
    it("lets you trigger the manual database schema sync", async () => {
      const store = await createTestStore();
      store.pushPath("/admin/databases/1");
      const dbEditApp = mount(store.connectContainer(<DatabaseEditApp />));
      await store.waitForActions([INITIALIZE_DATABASE]);

      clickButton(dbEditApp.find(".Button--syncDbSchema"));
      await store.waitForActions([SYNC_DATABASE_SCHEMA]);
      // TODO: do we have any way to see that the sync is actually in progress in the backend?
    });

    it("lets you trigger the manual rescan of field values", async () => {
      const store = await createTestStore();
      store.pushPath("/admin/databases/1");
      const dbEditApp = mount(store.connectContainer(<DatabaseEditApp />));
      await store.waitForActions([INITIALIZE_DATABASE]);

      clickButton(dbEditApp.find(".Button--rescanFieldValues"));
      await store.waitForActions([RESCAN_DATABASE_FIELDS]);
      // TODO: do we have any way to see that the field rescanning is actually in progress in the backend?
    });

    // TODO Atte Keinänen 8/15/17: Does losing field values potentially cause test failures in other test suites?
    it("lets you discard saved field values", async () => {
      // To be safe, let's mock the API method
      MetabaseApi.db_discard_values = jest.fn();
      const store = await createTestStore();
      store.pushPath("/admin/databases/1");
      const dbEditApp = mount(store.connectContainer(<DatabaseEditApp />));
      await store.waitForActions([INITIALIZE_DATABASE]);

      click(dbEditApp.find(".Button--discardSavedFieldValues"));
      clickButton(dbEditApp.find(TestModal).find(".Button--danger"));
      await store.waitForActions([DISCARD_SAVED_FIELD_VALUES]);

      expect(MetabaseApi.db_discard_values.mock.calls.length).toBe(1);
    });

    // Disabled because removal&recovery causes the db id to change
    it("lets you remove the dataset", () => {
      pending();

      // const store = await createTestStore()
      // store.pushPath("/admin/databases/1");
      // const dbEditApp = mount(store.connectContainer(<DatabaseEditApp />));
      // await store.waitForActions([INITIALIZE_DATABASE])
      //
      // try {
      //     click(dbEditApp.find(".Button--deleteDatabase"))
      //     console.log(dbEditApp.debug());
      //     await store.waitForActions([DELETE_DATABASE])
      //     await store.dispatch(addSampleDataset())
      // } catch(e) {
      //     throw e;
      // } finally {
      // }
    });
  });
});
