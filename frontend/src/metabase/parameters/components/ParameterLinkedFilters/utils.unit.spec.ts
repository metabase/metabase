import { checkNotNull } from "metabase/lib/types";
import { SAMPLE_METADATA } from "metabase-lib/test-helpers";
import { createMockUiParameter } from "metabase-lib/v1/parameters/mock";
import type { FieldId } from "metabase-types/api";
import {
  ORDERS,
  PEOPLE,
  PRODUCTS,
  REVIEWS,
} from "metabase-types/api/mocks/presets";

import { getFilterFieldsRequest, getParametersInfo } from "./utils";

function fieldById(fieldId: FieldId) {
  return checkNotNull(SAMPLE_METADATA.field(fieldId));
}

describe("getFilterFieldsRequest", () => {
  it.each([
    {
      parameter: createMockUiParameter({
        name: "p1",
        fields: [fieldById(PRODUCTS.CATEGORY)],
      }),
      otherParameters: [
        createMockUiParameter({
          name: "p2",
          fields: [fieldById(PRODUCTS.VENDOR)],
        }),
        createMockUiParameter({
          name: "p3",
          fields: [fieldById(PRODUCTS.VENDOR)],
        }),
        createMockUiParameter({
          name: "p4",
          fields: [fieldById(ORDERS.ID)],
        }),
      ],
      expectedRequest: {
        filtered: [PRODUCTS.CATEGORY],
        filtering: [PRODUCTS.VENDOR, ORDERS.ID],
      },
    },
    {
      parameter: createMockUiParameter({
        name: "p1",
        fields: [fieldById(PRODUCTS.CATEGORY)],
      }),
      otherParameters: [
        createMockUiParameter({
          name: "p2",
          fields: [],
        }),
      ],
      expectedRequest: undefined,
    },
    {
      parameter: createMockUiParameter({
        name: "p1",
        fields: [],
      }),
      otherParameters: [
        createMockUiParameter({
          name: "p2",
          fields: [fieldById(PRODUCTS.CATEGORY)],
        }),
      ],
      expectedRequest: undefined,
    },
  ])(
    "should return the correct request",
    ({ parameter, otherParameters, expectedRequest }) => {
      expect(getFilterFieldsRequest(parameter, otherParameters)).toEqual(
        expectedRequest,
      );
    },
  );
});

describe("getLinkedParametersInfo", () => {
  it("should return linked parameters with fields info", () => {
    const parameters = [
      createMockUiParameter({
        id: "p1",
        fields: [fieldById(PRODUCTS.VENDOR)],
      }),
      createMockUiParameter({
        id: "p2",
        fields: [fieldById(REVIEWS.RATING)],
      }),
      createMockUiParameter({
        id: "p3",
        fields: [fieldById(ORDERS.ID), fieldById(PEOPLE.ID)],
      }),
      createMockUiParameter({
        id: "p4",
        fields: [fieldById(ORDERS.ID), fieldById(ORDERS.PRODUCT_ID)],
      }),
      createMockUiParameter({
        id: "p5",
        fields: [fieldById(PEOPLE.ID)],
      }),
    ];

    const filteringIdsByFilteredId = {
      [PRODUCTS.CATEGORY]: [
        PRODUCTS.VENDOR,
        REVIEWS.RATING,
        ORDERS.ID,
        ORDERS.PRODUCT_ID,
      ],
      [PRODUCTS.VENDOR]: [REVIEWS.RATING, ORDERS.ID, ORDERS.PRODUCT_ID],
    };

    const expectedParameters = [
      {
        parameter: parameters[0],
        filteredIds: [PRODUCTS.CATEGORY],
        filteringIds: [PRODUCTS.VENDOR],
        isCompatible: true,
      },
      {
        parameter: parameters[1],
        filteredIds: [PRODUCTS.CATEGORY, PRODUCTS.VENDOR],
        filteringIds: [REVIEWS.RATING],
        isCompatible: true,
      },
      {
        parameter: parameters[2],
        filteredIds: [PRODUCTS.CATEGORY, PRODUCTS.VENDOR],
        filteringIds: [ORDERS.ID],
        isCompatible: true,
      },
      {
        parameter: parameters[3],
        filteredIds: [PRODUCTS.CATEGORY, PRODUCTS.VENDOR],
        filteringIds: [ORDERS.ID, ORDERS.PRODUCT_ID],
        isCompatible: true,
      },
      {
        parameter: parameters[4],
        filteredIds: [],
        filteringIds: [],
        isCompatible: false,
      },
    ];

    expect(getParametersInfo(parameters, filteringIdsByFilteredId)).toEqual(
      expectedParameters,
    );
  });
});
