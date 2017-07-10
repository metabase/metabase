/* eslint-disable */

describe("FieldApp", () => {
    describe("name settings", () => {
        it("lets you change field name", () => {
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
        it("lets you change to 'Use foreign key' and change the target for field with fk ", () => {
            // should ensure that the (inferred) field name is picked by default
            pending();
        })

        // just making sure that 'Use original value' option actually saves the value
        it("lets you switch back to Use original value after changing to some other value", () => {
            pending();
        })

        // just making sure that 'Use original value' option actually functions as expected
        it("lets you switch back to Use original value after changing to some other value", () => {
            pending();
        })
    })

    // add afterAll block that uses updateField to reset the field to plain state
    // additionally updateFieldValues should be maybe used for clearing all current field values
    // import { updateField } from "metabase/redux/metadata"
})