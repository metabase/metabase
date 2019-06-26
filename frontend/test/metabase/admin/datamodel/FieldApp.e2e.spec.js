import {
  useSharedAdminLogin,
  createTestStore,
  eventually,
} from "__support__/e2e_tests";

import {
  clickButton,
  setInputValue,
  click,
  dispatchBrowserEvent,
} from "__support__/enzyme_utils";

import { metadata as staticFixtureMetadata } from "__support__/sample_dataset_fixture";

import React from "react";
import { mount } from "enzyme";
import { delay } from "metabase/lib/promise";
import FieldApp, {
  FieldHeader,
} from "metabase/admin/datamodel/containers/FieldApp";
import FieldRemapping, {
  RemappingNamingTip,
  ValueRemappings,
  FieldValueMapping,
} from "metabase/admin/datamodel/components/FieldRemapping";
import InputBlurChange from "metabase/components/InputBlurChange";
import {
  FieldVisibilityPicker,
  SpecialTypeAndTargetPicker,
} from "metabase/admin/datamodel/components/database/ColumnItem";
import Popover from "metabase/components/Popover";
import Select from "metabase/components/Select";
import SelectButton from "metabase/components/SelectButton";
import ButtonWithStatus from "metabase/components/ButtonWithStatus";
import { getMetadata } from "metabase/selectors/metadata";
import Fields from "metabase/entities/fields";
import Tables from "metabase/entities/tables";
import Databases from "metabase/entities/databases";
import { MetabaseApi } from "metabase/services";

// TODO: Should we use the metabase/lib/urls methods for constructing urls also here?

// TODO Atte Keinänen 7/10/17: Use fixtures after metabase-lib branch has been merged

const CREATED_AT_ID = 1;
const PRODUCT_ID_FK_ID = 3;
const USER_ID_FK_ID = 7;
// enumeration with values 1, 2, 3, 4 or 5
const USER_SOURCE_TABLE_ID = 2;
const USER_SOURCE_ID = 18;

const PRODUCT_RATING_TABLE_ID = 4;
const PRODUCT_RATING_ID = 33;

const initFieldApp = async ({ tableId = 1, fieldId }) => {
  const store = await createTestStore();
  store.pushPath(`/admin/datamodel/database/1/table/${tableId}/${fieldId}`);
  const fieldApp = mount(store.connectContainer(<FieldApp />));
  await store.waitForActions([
    Databases.actions.fetchDatabaseMetadata,
    Tables.actions.fetchTableMetadata,
    Fields.actions.fetchFieldValues,
  ]);
  return { store, fieldApp };
};

describe("FieldApp", () => {
  beforeAll(async () => {
    useSharedAdminLogin();
  });

  describe("name settings", () => {
    const newTitle = "Brought Into Existence At";
    const newDescription =
      "The point in space-time when this order saw the light.";

    it("lets you change field name and description", async () => {
      const { store, fieldApp } = await initFieldApp({
        fieldId: CREATED_AT_ID,
      });

      const header = fieldApp.find(FieldHeader);
      expect(header.length).toBe(1);

      const nameInput = header.find(InputBlurChange).at(0);
      expect(nameInput.props().value).toBe(
        staticFixtureMetadata.fields["1"].display_name,
      );
      const descriptionInput = header.find(InputBlurChange).at(1);
      expect(descriptionInput.props().value).toBe(
        staticFixtureMetadata.fields["1"].description,
      );

      setInputValue(nameInput, newTitle);
      await store.waitForActions([Fields.actions.update]);

      setInputValue(descriptionInput, newDescription);
      await store.waitForActions([Fields.actions.update]);
    });

    it("should show the entered values after a page reload", async () => {
      const { fieldApp } = await initFieldApp({ fieldId: CREATED_AT_ID });

      const header = fieldApp.find(FieldHeader);
      expect(header.length).toBe(1);
      const nameInput = header.find(InputBlurChange).at(0);
      const descriptionInput = header.find(InputBlurChange).at(1);

      expect(nameInput.props().value).toBe(newTitle);
      expect(descriptionInput.props().value).toBe(newDescription);
    });

    afterAll(async () => {
      await MetabaseApi.field_update({
        id: CREATED_AT_ID,
        display_name: staticFixtureMetadata.fields[1].display_name,
        description: staticFixtureMetadata.fields[1].description,
      });
    });
  });

  describe("visibility settings", () => {
    it("shows correct default visibility", async () => {
      const { fieldApp } = await initFieldApp({ fieldId: CREATED_AT_ID });
      const visibilitySelect = fieldApp.find(FieldVisibilityPicker);
      expect(visibilitySelect.text()).toMatch(/Everywhere/);
    });

    it("lets you change field visibility", async () => {
      const { store, fieldApp } = await initFieldApp({
        fieldId: CREATED_AT_ID,
      });

      const visibilitySelect = fieldApp.find(FieldVisibilityPicker);
      click(visibilitySelect);
      click(
        visibilitySelect
          .find(Popover)
          .find("li")
          .at(1)
          .children()
          .first(),
      );

      await store.waitForActions([Fields.actions.update]);
    });

    it("should show the updated visibility setting after a page reload", async () => {
      const { fieldApp } = await initFieldApp({ fieldId: CREATED_AT_ID });

      const picker = fieldApp.find(FieldVisibilityPicker);
      expect(picker.text()).toMatch(/Only in Detail Views/);
    });

    afterAll(async () => {
      await MetabaseApi.field_update({
        id: CREATED_AT_ID,
        visibility_type: "normal",
      });
    });
  });

  describe("special type and target settings", () => {
    it("shows the correct default special type for a foreign key", async () => {
      const { fieldApp } = await initFieldApp({ fieldId: PRODUCT_ID_FK_ID });
      const picker = fieldApp.find(SpecialTypeAndTargetPicker).text();
      expect(picker).toMatch(/Foreign KeyProducts → ID/);
    });

    it("lets you change the type to 'No special type'", async () => {
      const { store, fieldApp } = await initFieldApp({
        fieldId: CREATED_AT_ID,
      });

      const picker = fieldApp.find(SpecialTypeAndTargetPicker);
      const typeSelect = picker.find(Select).at(0);
      click(typeSelect);

      const noSpecialTypeButton = typeSelect
        .find(Popover)
        .find("li")
        .last()
        .children()
        .first();
      click(noSpecialTypeButton);

      await store.waitForActions([Fields.actions.update]);
      expect(picker.text()).toMatch(/Select a special type/);
    });

    it("lets you change the type to 'Number'", async () => {
      const { store, fieldApp } = await initFieldApp({
        fieldId: CREATED_AT_ID,
      });
      const picker = fieldApp.find(SpecialTypeAndTargetPicker);
      const typeSelect = picker.find(Select).at(0);
      click(typeSelect);

      const noSpecialTypeButton = typeSelect
        .find(Popover)
        .find("li")
        .filterWhere(li => li.text() === "Number")
        .first()
        .children()
        .first();

      click(noSpecialTypeButton);

      await store.waitForActions([Fields.actions.update]);
      expect(picker.text()).toMatch(/Number/);
    });

    it("lets you change the type to 'Foreign key' and choose the target field", async () => {
      const { store, fieldApp } = await initFieldApp({
        fieldId: CREATED_AT_ID,
      });
      const picker = fieldApp.find(SpecialTypeAndTargetPicker);
      const typeSelect = picker.find(Select).at(0);
      click(typeSelect);

      const foreignKeyButton = typeSelect
        .find(Popover)
        .find("li")
        .at(2)
        .children()
        .first();
      click(foreignKeyButton);
      await store.waitForActions([Fields.actions.update]);

      expect(picker.text()).toMatch(/Foreign KeySelect a target/);
      const fkFieldSelect = picker.find(Select).at(1);
      click(fkFieldSelect);

      const productIdField = fkFieldSelect
        .find(Popover)
        .find("li")
        .filterWhere(li => /The numerical product number./.test(li.text()))
        .first()
        .children()
        .first();

      click(productIdField);
      await store.waitForActions([Fields.actions.update]);
      expect(picker.text()).toMatch(/Foreign KeyProducts → ID/);
    });

    afterAll(async () => {
      await MetabaseApi.field_update({
        id: CREATED_AT_ID,
        special_type: "type/CreationTimestamp",
        fk_target_field_id: null,
      });
    });
  });

  describe("display value / remapping settings", () => {
    it("shows only 'Use original value' for fields without fk and values", async () => {
      const { fieldApp } = await initFieldApp({ fieldId: CREATED_AT_ID });
      const section = fieldApp.find(FieldRemapping);
      const mappingTypePicker = section.find(Select).first();
      expect(mappingTypePicker.text()).toBe("Use original value");

      click(mappingTypePicker);
      const pickerOptions = mappingTypePicker.find(Popover).find("li");
      expect(pickerOptions.map(o => o.text())).toEqual(["Use original value"]);
    });

    it("lets you change to 'Use foreign key' and change the target for field with fk", async () => {
      const { store, fieldApp } = await initFieldApp({
        fieldId: USER_ID_FK_ID,
      });
      const section = fieldApp.find(FieldRemapping);
      const mappingTypePicker = section.find(Select);
      expect(mappingTypePicker.text()).toBe("Use original value");

      click(mappingTypePicker);
      const pickerOptions = mappingTypePicker.find(Popover).find("li");
      expect(pickerOptions.length).toBe(2);

      const useFKButton = pickerOptions
        .at(1)
        .children()
        .first();
      click(useFKButton);
      store.waitForActions([
        Fields.actions.updateFieldDimension,
        Tables.actions.fetchTableMetadata,
      ]);

      let fkFieldSelect;

      await eventually(() => {
        fkFieldSelect = section.find(SelectButton);
        expect(fkFieldSelect.text()).toBe("Name");
      });

      click(fkFieldSelect);

      const sourceField = fkFieldSelect
        .parent()
        .find(Popover)
        .find(".List-item")
        .filterWhere(li => /Source/.test(li.text()))
        .first()
        .children()
        .first();

      click(sourceField);
      store.waitForActions([Tables.actions.fetchTableMetadata]);

      await eventually(() => {
        fkFieldSelect = section.find(SelectButton);
        expect(fkFieldSelect.text()).toBe("Source");
      });
    });

    it("doesn't show date fields in fk options", async () => {
      const { fieldApp } = await initFieldApp({ fieldId: USER_ID_FK_ID });
      const section = fieldApp.find(FieldRemapping);
      const mappingTypePicker = section.find(Select);
      expect(mappingTypePicker.text()).toBe("Use foreign key");

      const fkFieldSelect = section.find(SelectButton);
      click(fkFieldSelect);

      const popover = fkFieldSelect.parent().find(Popover);
      expect(popover.length).toBe(1);

      const dateFieldIcons = popover.find("svg.Icon-calendar");
      expect(dateFieldIcons.length).toBe(0);
    });

    it("lets you switch back to Use original value after changing to some other value", async () => {
      const { store, fieldApp } = await initFieldApp({
        fieldId: USER_ID_FK_ID,
      });
      const section = fieldApp.find(FieldRemapping);
      const mappingTypePicker = section.find(Select);
      expect(mappingTypePicker.text()).toBe("Use foreign key");

      click(mappingTypePicker);
      const pickerOptions = mappingTypePicker.find(Popover).find("li");
      const useOriginalValue = pickerOptions
        .first()
        .children()
        .first();
      click(useOriginalValue);

      store.waitForActions([
        Fields.actions.deleteFieldDimension,
        Tables.actions.fetchTableMetadata,
      ]);
    });

    it("forces you to choose the FK field manually if there is no field with Field Name special type", async () => {
      const { store, fieldApp } = await initFieldApp({
        fieldId: USER_ID_FK_ID,
      });

      // Set FK id to `Reviews -> ID`  with a direct metadata update call
      const field = getMetadata(store.getState()).fields[USER_ID_FK_ID];
      await store.dispatch(
        Fields.actions.update({
          ...field.getPlainObject(),
          fk_target_field_id: 31,
        }),
      );

      const section = fieldApp.find(FieldRemapping);
      const mappingTypePicker = section.find(Select);
      expect(mappingTypePicker.text()).toBe("Use original value");
      click(mappingTypePicker);
      const pickerOptions = mappingTypePicker.find(Popover).find("li");
      expect(pickerOptions.length).toBe(2);

      const useFKButton = pickerOptions
        .at(1)
        .children()
        .first();
      click(useFKButton);
      store.waitForActions([
        Fields.actions.updateFieldDimension,
        Tables.actions.fetchTableMetadata,
      ]);
      // TODO: Figure out a way to avoid using delay – the use of delays may lead to occasional CI failures
      await delay(500);

      expect(section.find(RemappingNamingTip).length).toBe(1);

      dispatchBrowserEvent("mousedown", {
        e: { target: document.documentElement },
      });
      await delay(300); // delay needed because of setState in FieldApp; app.update() does not work for whatever reason
      expect(section.find(".text-error").length).toBe(1); // warning that you should choose a column
    });

    it("doesn't let you enter custom remappings for a field with string values", async () => {
      const { fieldApp } = await initFieldApp({
        tableId: USER_SOURCE_TABLE_ID,
        fieldId: USER_SOURCE_ID,
      });
      const section = fieldApp.find(FieldRemapping);
      const mappingTypePicker = section.find(Select);

      expect(mappingTypePicker.text()).toBe("Use original value");
      click(mappingTypePicker);
      const pickerOptions = mappingTypePicker.find(Popover).find("li");
      expect(pickerOptions.length).toBe(1);
    });

    // TODO: Make sure that product rating is a Category and that a sync has been run
    it("lets you enter custom remappings for a field with numeral values", async () => {
      const { store, fieldApp } = await initFieldApp({
        tableId: PRODUCT_RATING_TABLE_ID,
        fieldId: PRODUCT_RATING_ID,
      });
      const section = fieldApp.find(FieldRemapping);
      const mappingTypePicker = section.find(Select);

      expect(mappingTypePicker.text()).toBe("Use original value");
      click(mappingTypePicker);
      const pickerOptions = mappingTypePicker.find(Popover).find("li");
      expect(pickerOptions.length).toBe(2);

      const customMappingButton = pickerOptions
        .at(1)
        .children()
        .first();
      click(customMappingButton);

      store.waitForActions([
        Fields.actions.updateFieldDimension,
        Tables.actions.fetchTableMetadata,
      ]);
      // TODO: Figure out a way to avoid using delay – using delays may lead to occasional CI failures
      await delay(500);

      const valueRemappingsSection = section.find(ValueRemappings);
      expect(valueRemappingsSection.length).toBe(1);

      const fieldValueMappings = valueRemappingsSection.find(FieldValueMapping);
      expect(fieldValueMappings.length).toBe(5);

      const firstMapping = fieldValueMappings.at(0);
      expect(firstMapping.find("h3").text()).toBe("1");
      expect(firstMapping.find(InputBlurChange).props().value).toBe("1");
      setInputValue(firstMapping.find(InputBlurChange), "Terrible");

      const lastMapping = fieldValueMappings.last();
      expect(lastMapping.find("h3").text()).toBe("5");
      expect(lastMapping.find(InputBlurChange).props().value).toBe("5");
      setInputValue(
        lastMapping.find(InputBlurChange),
        "Extraordinarily awesome",
      );

      const saveButton = valueRemappingsSection.find(ButtonWithStatus);
      clickButton(saveButton);

      store.waitForActions([Fields.actions.updateFieldValues]);
    });

    it("shows the updated values after page reload", async () => {
      const { fieldApp } = await initFieldApp({
        tableId: PRODUCT_RATING_TABLE_ID,
        fieldId: PRODUCT_RATING_ID,
      });
      const section = fieldApp.find(FieldRemapping);
      const mappingTypePicker = section.find(Select);

      expect(mappingTypePicker.text()).toBe("Custom mapping");
      const fieldValueMappings = section.find(FieldValueMapping);
      expect(
        fieldValueMappings
          .first()
          .find(InputBlurChange)
          .props().value,
      ).toBe("Terrible");
      expect(
        fieldValueMappings
          .last()
          .find(InputBlurChange)
          .props().value,
      ).toBe("Extraordinarily awesome");
    });

    afterAll(async () => {
      const store = await createTestStore();
      await store.dispatch(Tables.actions.fetchTableMetadata({ id: 1 }));

      const field = getMetadata(store.getState()).fields[USER_ID_FK_ID];
      await store.dispatch(
        Fields.actions.update({
          ...field.getPlainObject(),
          fk_target_field_id: 13, // People -> ID
        }),
      );

      await store.dispatch(
        Fields.actions.deleteFieldDimension({ id: USER_ID_FK_ID }),
      );
      await store.dispatch(
        Fields.actions.deleteFieldDimension({ id: PRODUCT_RATING_ID }),
      );

      // TODO: This is a little hacky – could there be a way to simply reset the user-defined valued?
      await store.dispatch(
        Fields.actions.updateFieldValues({ id: PRODUCT_RATING_ID }, [
          [1, "1"],
          [2, "2"],
          [3, "3"],
          [4, "4"],
          [5, "5"],
        ]),
      );
    });
  });
});
