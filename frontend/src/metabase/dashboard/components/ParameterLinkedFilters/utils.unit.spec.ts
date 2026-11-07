import { createMockUiParameter } from "metabase-lib/v1/parameters/mock";
import {
  ORDERS,
  PRODUCTS,
  REVIEWS,
  createOrdersIdField,
  createOrdersProductIdField,
  createPeopleIdField,
  createProductsCategoryField,
  createProductsVendorField,
  createReviewsRatingField,
} from "metabase-types/api/mocks/presets";

import { getFilterFieldsRequest, getParametersInfo } from "./utils";

describe("getFilterFieldsRequest", () => {
  it.each([
    {
      parameter: createMockUiParameter({
        name: "p1",
        fields: [createProductsCategoryField()],
      }),
      otherParameters: [
        createMockUiParameter({
          name: "p2",
          fields: [createProductsVendorField()],
        }),
        createMockUiParameter({
          name: "p3",
          fields: [createProductsVendorField()],
        }),
        createMockUiParameter({
          name: "p4",
          fields: [createOrdersIdField()],
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
        fields: [createProductsCategoryField()],
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
          fields: [createProductsCategoryField()],
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
        fields: [createProductsVendorField()],
      }),
      createMockUiParameter({
        id: "p2",
        fields: [createReviewsRatingField()],
      }),
      createMockUiParameter({
        id: "p3",
        fields: [createOrdersIdField(), createPeopleIdField()],
      }),
      createMockUiParameter({
        id: "p4",
        fields: [createOrdersIdField(), createOrdersProductIdField()],
      }),
      createMockUiParameter({
        id: "p5",
        fields: [createPeopleIdField()],
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
