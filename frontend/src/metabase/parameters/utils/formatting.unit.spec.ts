import { formatParameterValue } from "./formatting";
import { createMockUiParameter } from "metabase/parameters/mock";

import Field from "metabase-lib/lib/metadata/Field";
import { PRODUCTS, ORDERS } from "__support__/sample_database_fixture";

const numberField = ORDERS.TOTAL;
const textField = PRODUCTS.TITLE;
const categoryField = PRODUCTS.CATEGORY;

const remappedField = new Field({
  base_type: "type/Text",
  human_readable_field_id: numberField.id,
  remapping: new Map([[123456789, 0]]),
});

describe("metabase/parameters/utils/formatting", () => {
  describe("formatParameterValue", () => {
    const cases = [
      {
        type: "date/range",
        value: "1995-01-01~1995-01-10",
        expected: "January 1, 1995 - January 10, 1995",
      },
      {
        type: "date/single",
        value: "2018-01-01",
        expected: "January 1, 2018",
      },
      {
        type: "date/all-options",
        value: "2018-01-01",
        expected: "On January 1, 2018",
      },
      {
        type: "date/month-year",
        value: "2018-01",
        expected: "January, 2018",
      },
      {
        type: "date/quarter-year",
        value: "Q1-2018",
        expected: "Q1, 2018",
      },
      {
        type: "date/relative",
        value: "past30days",
        expected: "Past 30 Days",
      },
      {
        type: "number/=",
        value: 123456789,
        expected: "123,456,789",
        fields: [numberField],
      },
      {
        type: "number/>=",
        value: 1.111111111111,
        expected: "1.111111111111",
        fields: [],
      },
      {
        type: "number/>=",
        value: 1.111111111111,
        expected: 1.111111111111,
        fields: [],
        hasVariableTemplateTagTarget: true,
      },
      {
        type: "string/=",
        value: "abc",
        expected: "abc",
        fields: [textField],
      },
      {
        type: "category",
        value: "foo",
        expected: "foo",
        fields: [categoryField],
      },
      {
        type: "location/city",
        value: "foo",
        expected: "foo",
        fields: [],
      },
      {
        type: "number/=",
        value: [1, 2, 3, 4, 5],
        expected: "5 selections",
        fields: [numberField],
      },
      {
        type: "number/=",
        value: [1],
        expected: "1",
        fields: [numberField],
      },
    ];

    test.each(cases)(
      "should format $type parameter",
      ({ value, expected, ...parameterProps }) => {
        const parameter = createMockUiParameter(parameterProps);
        expect(formatParameterValue(value, parameter)).toEqual(expected);
      },
    );

    it("should not remap a field filter parameter connected to more than one field", () => {
      const parameter = createMockUiParameter({
        type: "number/=",
        fields: [remappedField, numberField],
      });
      expect(formatParameterValue(123456789, parameter)).toEqual("123456789");
    });

    it("should remap a field filter parameter value with a target field that is remapped", () => {
      const parameter = createMockUiParameter({
        type: "number/=",
        fields: [remappedField],
      });
      expect(formatParameterValue(123456789, parameter)).toEqual(0);
    });
  });
});
