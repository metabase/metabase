
import React from "react";
import ReactDOM from "react-dom";
import { renderIntoDocument } from "react-addons-test-utils";

import FieldName from "metabase/query_builder/components/FieldName.jsx";

const TABLE_A = {
    fields: [
        { id: 1, display_name: "Foo" },
        { id: 2, display_name: "Baz", parent_id: 1 }
    ]
}
const TABLE_B = {
    fields: [
        { id: 3, display_name: "Bar", target: { table: TABLE_A } }
    ]
}

describe("FieldName", () => {
    it("should render regular field correctly", () => {
        let fieldName = renderIntoDocument(<FieldName field={1} tableMetadata={TABLE_A}/>);
        expect(ReactDOM.findDOMNode(fieldName).textContent).toEqual("Foo");
    });
    it("should render local field correctly", () => {
        let fieldName = renderIntoDocument(<FieldName field={["field-id", 1]} tableMetadata={TABLE_A}/>);
        expect(ReactDOM.findDOMNode(fieldName).textContent).toEqual("Foo");
    });
    it("should render foreign key correctly", () => {
        let fieldName = renderIntoDocument(<FieldName field={["fk->", 3, 1]} tableMetadata={TABLE_B}/>);
        expect(ReactDOM.findDOMNode(fieldName).textContent).toEqual("BarFoo");
    });
    it("should render datetime correctly", () => {
        let fieldName = renderIntoDocument(<FieldName field={["datetime-field", 1, "week"]} tableMetadata={TABLE_A}/>);
        expect(ReactDOM.findDOMNode(fieldName).textContent).toEqual("Foo: Week");
    });
    it("should render nested field correctly", () => {
        let fieldName = renderIntoDocument(<FieldName field={2} tableMetadata={TABLE_A}/>);
        expect(ReactDOM.findDOMNode(fieldName).textContent).toEqual("Foo: Baz");
    });
    it("should render nested fk field correctly", () => {
        let fieldName = renderIntoDocument(<FieldName field={["fk->", 3, 2]} tableMetadata={TABLE_B}/>);
        expect(ReactDOM.findDOMNode(fieldName).textContent).toEqual("BarFoo: Baz");
    });
});
