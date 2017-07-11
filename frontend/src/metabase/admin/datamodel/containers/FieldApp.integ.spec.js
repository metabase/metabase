import {
    login,
    createTestStore,
} from "metabase/__support__/integrated_tests";

import { deleteFieldDimension, fetchTableMetadata, updateField } from "metabase/redux/metadata"

import React from 'react';
import QueryBuilder from "metabase/query_builder/containers/QueryBuilder";
import { mount } from "enzyme";
import { INITIALIZE_QB } from "metabase/query_builder/actions";
import QueryHeader from "metabase/query_builder/components/QueryHeader";
import { VisualizationEmptyState } from "metabase/query_builder/components/QueryVisualization";
import { FETCH_IDFIELDS } from "metabase/admin/datamodel/datamodel";
import FieldApp, { FieldHeader } from "metabase/admin/datamodel/containers/FieldApp";

const getRawFieldWithId = (store, fieldId) => store.getState().metadata.fields[fieldId];

// TODO: Should we use the metabase/lib/urls methods for constructing urls also here?

// TODO Atte Keinänen 7/10/17: Use fixtures after metabase-lib branch has been merged

const CREATED_AT_ID = 1;
const PRODUCT_ID_FK_ID = 3;
// enumeration with values 1, 2, 3, 4 or 5
const PRODUCT_RATING_FK = 33;

const initFieldApp = async ({ fieldId }) => {
    const store = await createTestStore()
    store.pushPath(`/admin/datamodel/database/1/table/1/${CREATED_AT_ID}`);

    const fieldApp = mount(store.connectContainer(<FieldApp />));

    await store.waitForActions([FETCH_IDFIELDS]);

    return { store, fieldApp }
}

describe("FieldApp", () => {
    beforeAll(async () => {
        await login()
    })

    describe("name settings", () => {
        it("lets you change field name", async () => {
            const { store, fieldApp } = await initFieldApp({ fieldId: CREATED_AT_ID });

            expect(fieldApp.find(FieldHeader).length).toBe(1)

            pending();
        })
        it("lets you change field description", () => {
            pending();
        })
    })

    describe("visibility settings", () => {
        it("lets you change field visibility", () => {
            pending();
        })
    })

    describe("special type and target settings", () => {
        it("lets you change the type to 'No special type'", () => {
            pending();
        })

        it("lets you change the type to 'Number'", () => {
            pending();
        })

        it("lets you change the type to 'Foreign key' and choose the target field", () => {
            pending();
        })
    })

    describe("display value / remapping settings", () => {
        it("shows only 'Use original value' for fields without fk and values", () => {
            pending();
        })
        // should 'Use foreign key' be shown by default for foreign keys?
        it("lets you change to 'Use foreign key' and change the target for field with fk", () => {
            // should ensure that the (inferred) field name is picked by default
            pending();
        })

        // just making sure that 'Use original value' option actually saves the value
        it("lets you switch back to Use original value after changing to some other value", () => {
            pending();
        })
    })

    afterAll(async () => {
        // add afterAll block that uses updateField to reset the field to plain state
        // additionally updateFieldValues should be maybe used for clearing all current field values

        const store = await createTestStore()
        await fetchTableMetadata(1);
        const createdAtField = getRawFieldWithId(store, CREATED_AT_ID)

        // TODO: Could the metabase-lib static fixture be used for resetting the field?
        await store.dispatch(updateField({
            ...createdAtField,
            name: "Created At",
            description: "The date and time an order was submitted.",
            visibility_type: "normal",
            special_type: null
        }))


        await store.dispatch(deleteFieldDimension(createdAtField.id));
    })
})