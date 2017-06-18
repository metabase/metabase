import React from 'react'
import { mount } from 'enzyme'

import FieldList from './FieldList';
import Question from "metabase-lib/lib/Question";
import {
    DATABASE_ID,
    ORDERS_TABLE_ID,
    ORDERS_PRODUCT_FK_FIELD_ID,
    metadata
} from "metabase/__support__/sample_dataset_fixture";

import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

const getFieldList = (query, fieldOptions) =>
    <FieldList
        tableMetadata={query.tableMetadata()}
        fieldOptions={fieldOptions}
        customFieldOptions={query.expressions()}
        onFieldChange={() => {}}
        enableSubDimensions={false}
    />

describe('FieldList', () => {
    it("should allow adding the first breakout", () => {
        const expressionName = "70% of subtotal";
        const query: StructuredQuery = Question.create({databaseId: DATABASE_ID, tableId: ORDERS_TABLE_ID, metadata})
            .query()
            .updateExpression(expressionName, ["*", ["field-id", 4], 0.7])

        // Use the count aggregation as an example case
        const fieldOptions = query.aggregationFieldOptions("sum");
        const component = mount(getFieldList(query, fieldOptions));
        expect(component.find(`.List-item-title[children="${expressionName}"]`).length).toBe(1);
    });
});