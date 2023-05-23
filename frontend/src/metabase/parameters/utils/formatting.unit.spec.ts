import { createMockMetadata } from "__support__/metadata";
import { checkNotNull } from "metabase/core/utils/types";
import { createMockField } from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  PRODUCTS,
  ORDERS,
} from "metabase-types/api/mocks/presets";
import { createMockUiParameter } from "metabase-lib/parameters/mock";
import { formatParameterValue } from "./formatting";

const REMAPPED_FIELD_ID = 100;

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
  fields: [
    createMockField({
      id: REMAPPED_FIELD_ID,
      base_type: "type/Text",
      remappings: [[123456789, "A"]],
    }),
  ],
});

const numberField = checkNotNull(metadata.field(ORDERS.TOTAL));
const textField = checkNotNull(metadata.field(PRODUCTS.TITLE));
const categoryField = checkNotNull(metadata.field(PRODUCTS.CATEGORY));
const remappedField = checkNotNull(metadata.field(REMAPPED_FIELD_ID));

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
      expect(formatParameterValue(123456789, parameter)).toEqual("A");
    });
  });
});
