import {
    login,
    createTestStore,
} from "metabase/__support__/integrated_tests";

import {
    DELETE_FIELD_DIMENSION,
    deleteFieldDimension, FETCH_TABLE_METADATA, fetchTableMetadata, UPDATE_FIELD, UPDATE_FIELD_DIMENSION,
    updateField
} from "metabase/redux/metadata"

import React from 'react';
import { mount } from "enzyme";
import { FETCH_IDFIELDS } from "metabase/admin/datamodel/datamodel";
import { delay } from "metabase/lib/promise"
import FieldApp, { FieldHeader, FieldRemapping } from "metabase/admin/datamodel/containers/FieldApp";
import Input from "metabase/components/Input";
import {
    FieldVisibilityPicker,
    SpecialTypeAndTargetPicker
} from "metabase/admin/datamodel/components/database/ColumnItem";
import { TestPopover } from "metabase/components/Popover";
import Select from "metabase/components/Select";
import SelectButton from "metabase/components/SelectButton";

const getRawFieldWithId = (store, fieldId) => store.getState().metadata.fields[fieldId];

// TODO: Should we use the metabase/lib/urls methods for constructing urls also here?

// TODO Atte Keinänen 7/10/17: Use fixtures after metabase-lib branch has been merged

const CREATED_AT_ID = 1;
const PRODUCT_ID_FK_ID = 3;
// enumeration with values 1, 2, 3, 4 or 5
// const PRODUCT_RATING_FK = 33;

const initFieldApp = async ({ fieldId }) => {
    const store = await createTestStore()
    store.pushPath(`/admin/datamodel/database/1/table/1/${fieldId}`);
    const fieldApp = mount(store.connectContainer(<FieldApp />));
    await store.waitForActions([FETCH_IDFIELDS]);
    store.resetDispatchedActions();
    return { store, fieldApp }
}

describe("FieldApp", () => {
    beforeAll(async () => {
        await login()
    })

    describe("name settings", () => {
        const newTitle = 'Brought Into Existence At'
        const newDescription = 'The point in space-time when this order saw the light.'

        it("lets you change field name and description", async () => {
            const { store, fieldApp } = await initFieldApp({ fieldId: CREATED_AT_ID });

            const header = fieldApp.find(FieldHeader)
            expect(header.length).toBe(1)
            const nameInput = header.find(Input).at(0);
            const descriptionInput = header.find(Input).at(1);

            nameInput.simulate('change', {target: {value: newTitle}});
            await store.waitForActions([UPDATE_FIELD])
            store.resetDispatchedActions();

            descriptionInput.simulate('change', {target: {value: newDescription}});
            await store.waitForActions([UPDATE_FIELD])
        })

        it("should show the entered values after a page reload", async () => {
            const { fieldApp } = await initFieldApp({ fieldId: CREATED_AT_ID });

            const header = fieldApp.find(FieldHeader)
            expect(header.length).toBe(1)
            const nameInput = header.find(Input).at(0);
            const descriptionInput = header.find(Input).at(1);

            expect(nameInput.props().value).toBe(newTitle);
            expect(descriptionInput.props().value).toBe(newDescription);
        })
    })

    describe("visibility settings", () => {
        it("shows correct default visibility", async () => {
            const { fieldApp } = await initFieldApp({ fieldId: CREATED_AT_ID });
            const visibilitySelect = fieldApp.find(FieldVisibilityPicker);
            expect(visibilitySelect.text()).toMatch(/Everywhere/);
        })

        it("lets you change field visibility", async () => {
            const { store, fieldApp } = await initFieldApp({ fieldId: CREATED_AT_ID });

            const visibilitySelect = fieldApp.find(FieldVisibilityPicker);
            visibilitySelect.simulate('click');
            visibilitySelect.find(TestPopover).find("li").at(1).children().first().simulate("click");

            await store.waitForActions([UPDATE_FIELD])
        })

        it("should show the updated visibility setting after a page reload", async () => {
            const { fieldApp } = await initFieldApp({ fieldId: CREATED_AT_ID });

            const picker = fieldApp.find(FieldVisibilityPicker);
            expect(picker.text()).toMatch(/Only in Detail Views/);
        })
    })

    describe("special type and target settings", () => {
        it("shows the correct default special type for a foreign key", async () => {
            const { fieldApp } = await initFieldApp({ fieldId: PRODUCT_ID_FK_ID });
            const picker = fieldApp.find(SpecialTypeAndTargetPicker).text()
            expect(picker).toMatch(/Foreign KeyPublic.Products → ID/);
        })

        it("lets you change the type to 'No special type'", async () => {
            const { store, fieldApp } = await initFieldApp({ fieldId: CREATED_AT_ID });
            const picker = fieldApp.find(SpecialTypeAndTargetPicker)
            const typeSelect = picker.find(Select).at(0)
            typeSelect.simulate('click');

            const noSpecialTypeButton = typeSelect.find(TestPopover).find("li").last().children().first()
            noSpecialTypeButton.simulate("click");

            await store.waitForActions([UPDATE_FIELD])
            expect(picker.text()).toMatch(/Select a special type/);
        })

        it("lets you change the type to 'Number'", async () => {
            const { store, fieldApp } = await initFieldApp({ fieldId: CREATED_AT_ID });
            const picker = fieldApp.find(SpecialTypeAndTargetPicker)
            const typeSelect = picker.find(Select).at(0)
            typeSelect.simulate('click');

            const noSpecialTypeButton = typeSelect.find(TestPopover)
                .find("li")
                .filterWhere(li => li.text() === "Number").first()
                .children().first();

            noSpecialTypeButton.simulate("click");

            await store.waitForActions([UPDATE_FIELD])
            expect(picker.text()).toMatch(/Number/);
        })

        it("lets you change the type to 'Foreign key' and choose the target field", async () => {
            const { store, fieldApp } = await initFieldApp({ fieldId: CREATED_AT_ID });
            const picker = fieldApp.find(SpecialTypeAndTargetPicker)
            const typeSelect = picker.find(Select).at(0)
            typeSelect.simulate('click');

            const foreignKeyButton = typeSelect.find(TestPopover).find("li").at(2).children().first();
            foreignKeyButton.simulate("click");
            await store.waitForActions([UPDATE_FIELD])
            store.resetDispatchedActions();

            expect(picker.text()).toMatch(/Foreign KeySelect a target/);
            const fkFieldSelect = picker.find(Select).at(1)
            fkFieldSelect.simulate('click');

            const birthDateFkField = fkFieldSelect.find(TestPopover)
                .find("li")
                .filterWhere(li => /The name of the product as it should be displayed to customers/.test(li.text()))
                .first().children().first();

            birthDateFkField.simulate('click')
            await store.waitForActions([UPDATE_FIELD])
            expect(picker.text()).toMatch(/Foreign KeyPublic.Products → Title/);
        })

        afterAll(async () => {
            // add afterAll block that uses updateField to reset the field to plain state
            // additionally updateFieldValues should be maybe used for clearing all current field values

            const store = await createTestStore()
            await store.dispatch(fetchTableMetadata(1));
            const createdAtField = getRawFieldWithId(store, CREATED_AT_ID)

            // TODO: Could the metabase-lib static fixture be used for resetting the field?
            await store.dispatch(updateField({
                ...createdAtField,
                name: "Created At",
                description: "The date and time an order was submitted.",
                visibility_type: "normal",
                special_type: null,
                fk_target_field_id: null
            }))


            // await store.dispatch(deleteFieldDimension(createdAtField.id));
        })
    })

    describe("display value / remapping settings", () => {
        it("shows only 'Use original value' for fields without fk and values", async () => {
            const { fieldApp } = await initFieldApp({ fieldId: CREATED_AT_ID });
            const section = fieldApp.find(FieldRemapping)
            const mappingTypePicker = section.find(Select).first();
            expect(mappingTypePicker.text()).toBe('Use original value')

            mappingTypePicker.simulate('click');
            const pickerOptions = mappingTypePicker.find(TestPopover).find("li");
            expect(pickerOptions.length).toBe(1);
        })
        // should 'Use foreign key' be shown by default for foreign keys?
        it("lets you change to 'Use foreign key' and change the target for field with fk", async () => {
            const { store, fieldApp } = await initFieldApp({ fieldId: PRODUCT_ID_FK_ID });
            const section = fieldApp.find(FieldRemapping)
            const mappingTypePicker = section.find(Select);
            expect(mappingTypePicker.text()).toBe('Use original value')

            mappingTypePicker.simulate('click');
            const pickerOptions = mappingTypePicker.find(TestPopover).find("li");
            expect(pickerOptions.length).toBe(2);

            const useFKButton = pickerOptions.at(1).children().first()
            useFKButton.simulate('click');
            store.waitForActions([UPDATE_FIELD_DIMENSION, FETCH_TABLE_METADATA])
            store.resetDispatchedActions();
            await delay(500); // TODO: WHY NEEDED ???

            const fkFieldSelect = section.find(SelectButton);

            // TODO: Change the expectation to the first named field
            expect(fkFieldSelect.text()).toBe("Choose a field");
            fkFieldSelect.simulate('click');

            const sourceField = fkFieldSelect.parent().find(TestPopover)
                .find("li")
                .filterWhere(li => /Vendor/.test(li.text()))
                .first().children().first();

            sourceField.simulate('click')
            store.waitForActions([FETCH_TABLE_METADATA])
            await delay(500); // TODO: WHY NEEDED ???
            expect(fkFieldSelect.text()).toBe("Vendor");
        })


        // just making sure that 'Use original value' option actually saves the value
        it("lets you switch back to Use original value after changing to some other value", async () => {
            const { store, fieldApp } = await initFieldApp({ fieldId: PRODUCT_ID_FK_ID });
            const section = fieldApp.find(FieldRemapping)
            const mappingTypePicker = section.find(Select);
            expect(mappingTypePicker.text()).toBe('Use foreign key')

            mappingTypePicker.simulate('click');
            const pickerOptions = mappingTypePicker.find(TestPopover).find("li");
            const useOriginalValue = pickerOptions.first().children().first()
            useOriginalValue.simulate('click');

            store.waitForActions([DELETE_FIELD_DIMENSION, FETCH_TABLE_METADATA]);
        })

        afterAll(async () => {

            const store = await createTestStore()
            await store.dispatch(deleteFieldDimension(PRODUCT_ID_FK_ID));
        })
    })

})