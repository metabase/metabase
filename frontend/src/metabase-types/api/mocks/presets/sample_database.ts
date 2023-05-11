import { Database, Field, FieldValues, Table } from "metabase-types/api";
import {
  createMockDatabase,
  createMockTable,
  createMockField,
  createMockFingerprint,
  createMockGlobalFieldFingerprint,
  createMockTextFieldFingerprint,
  createMockNumberFieldFingerprint,
  createMockDateTimeFieldFingerprint,
} from "metabase-types/api/mocks";

export const SAMPLE_DB_ID = 1;
export const ORDERS_ID = 2;
export const PEOPLE_ID = 5;
export const PRODUCTS_ID = 1;
export const REVIEWS_ID = 8;

export const ORDERS = {
  ID: 11,
  USER_ID: 15,
  PRODUCT_ID: 9,
  SUBTOTAL: 16,
  TAX: 10,
  TOTAL: 13,
  DISCOUNT: 17,
  CREATED_AT: 14,
  QUANTITY: 12,
};

export const PEOPLE = {
  ID: 32,
  ADDRESS: 42,
  EMAIL: 37,
  PASSWORD: 34,
  NAME: 39,
  CITY: 31,
  LONGITUDE: 40,
  STATE: 33,
  SOURCE: 36,
  BIRTH_DATE: 35,
  ZIP: 43,
  LATITUDE: 41,
  CREATED_AT: 38,
};

export const PRODUCTS = {
  ID: 3,
  EAN: 5,
  TITLE: 8,
  CATEGORY: 1,
  VENDOR: 4,
  PRICE: 7,
  RATING: 2,
  CREATED_AT: 6,
};

export const REVIEWS = {
  ID: 67,
  PRODUCT_ID: 68,
  REVIEWER: 69,
  RATING: 66,
  BODY: 70,
  CREATED_AT: 71,
};

// Note: don't assign field values to the field object itself
// Field values are not included in the field object in the API response
// Please use `setupFieldValuesEndpoints` utility from `__support__/server-mocks`

export const PRODUCT_CATEGORY_VALUES: FieldValues = {
  field_id: PRODUCTS.CATEGORY,
  values: [["Doohickey"], ["Gadget"], ["Gizmo"], ["Widget"]],
  has_more_values: false,
};

export const PRODUCT_VENDOR_VALUES: FieldValues = {
  field_id: PRODUCTS.VENDOR,
  values: [["Vendor 1"], ["Vendor 2"], ["Vendor 3"], ["Vendor 4"]],
  has_more_values: true,
};

export const PEOPLE_SOURCE_VALUES: FieldValues = {
  field_id: PEOPLE.SOURCE,
  values: [["Affiliate"], ["Facebook"], ["Google"], ["Organic"], ["Twitter"]],
  has_more_values: false,
};

export const createSampleDatabase = (opts?: Partial<Database>): Database =>
  createMockDatabase({
    id: SAMPLE_DB_ID,
    name: "Sample Database",
    tables: [
      createOrdersTable(),
      createPeopleTable(),
      createProductsTable(),
      createReviewsTable(),
    ],
    is_sample: true,
    ...opts,
  });

export const createOrdersTable = (opts?: Partial<Table>): Table =>
  createMockTable({
    id: ORDERS_ID,
    db_id: SAMPLE_DB_ID,
    name: "ORDERS",
    display_name: "Orders",
    schema: "PUBLIC",
    fields: [
      createOrdersIdField(),
      createOrdersUserIdField(),
      createOrdersProductIdField(),
      createOrdersSubtotalField(),
      createOrdersTaxField(),
      createOrdersTotalField(),
      createOrdersDiscountField(),
      createOrdersCreatedAtField(),
      createOrdersQuantityField(),
    ],
    ...opts,
  });

export const createPeopleTable = (opts?: Partial<Table>): Table =>
  createMockTable({
    id: PEOPLE_ID,
    db_id: SAMPLE_DB_ID,
    name: "PEOPLE",
    display_name: "People",
    schema: "PUBLIC",
    fields: [
      createPeopleIdField(),
      createPeopleAddressField(),
      createPeopleEmailField(),
      createPeoplePasswordField(),
      createPeopleNameField(),
      createPeopleCityField(),
      createPeopleLongitudeField(),
      createPeopleStateField(),
      createPeopleSourceField(),
      createPeopleBirthDateField(),
      createPeopleZipField(),
      createPeopleLatitudeField(),
      createPeopleCreatedAtField(),
    ],
    ...opts,
  });

export const createProductsTable = (opts?: Partial<Table>): Table =>
  createMockTable({
    id: PRODUCTS_ID,
    db_id: SAMPLE_DB_ID,
    name: "PRODUCTS",
    display_name: "Products",
    schema: "PUBLIC",
    fields: [
      createProductsIdField(),
      createProductsEanField(),
      createProductsTitleField(),
      createProductsCategoryField(),
      createProductsVendorField(),
      createProductsPriceField(),
      createProductsRatingField(),
      createProductsCreatedAtField(),
    ],
    ...opts,
  });

export const createReviewsTable = (opts?: Partial<Table>): Table =>
  createMockTable({
    id: REVIEWS_ID,
    db_id: SAMPLE_DB_ID,
    name: "REVIEWS",
    display_name: "Reviews",
    schema: "PUBLIC",
    fields: [
      createReviewsIdField(),
      createReviewsProductIdField(),
      createReviewsReviewerField(),
      createReviewsRatingField(),
      createReviewsBodyField(),
      createReviewsCreatedAtField(),
    ],
    ...opts,
  });

export const createOrdersIdField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: ORDERS.ID,
    table_id: ORDERS_ID,
    name: "ID",
    display_name: "ID",
    base_type: "type/BigInteger",
    effective_type: "type/BigInteger",
    semantic_type: "type/PK",
    has_field_values: "none",
    fingerprint: null,
    ...opts,
  });

export const createOrdersUserIdField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: ORDERS.USER_ID,
    table_id: ORDERS_ID,
    name: "USER_ID",
    display_name: "User ID",
    base_type: "type/Integer",
    effective_type: "type/Integer",
    semantic_type: "type/FK",
    fk_target_field_id: PEOPLE.ID,
    has_field_values: "none",
    fingerprint: createMockFingerprint({
      global: createMockGlobalFieldFingerprint({
        "distinct-count": 929,
      }),
    }),
    ...opts,
  });

export const createOrdersProductIdField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: ORDERS.PRODUCT_ID,
    table_id: ORDERS_ID,
    name: "PRODUCT_ID",
    display_name: "Product ID",
    base_type: "type/Integer",
    effective_type: "type/Integer",
    semantic_type: "type/FK",
    fk_target_field_id: PRODUCTS.ID,
    has_field_values: "none",
    fingerprint: createMockFingerprint({
      global: createMockGlobalFieldFingerprint({
        "distinct-count": 200,
      }),
    }),
    ...opts,
  });

export const createOrdersSubtotalField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: ORDERS.SUBTOTAL,
    table_id: ORDERS_ID,
    name: "SUBTOTAL",
    display_name: "Subtotal",
    base_type: "type/Float",
    effective_type: "type/Float",
    semantic_type: null,
    has_field_values: "none",
    fingerprint: createMockFingerprint({
      global: createMockGlobalFieldFingerprint({
        "distinct-count": 340,
      }),
      type: {
        "type/Number": createMockNumberFieldFingerprint({
          min: 15.691943673970439,
          q1: 49.74894519060184,
          q3: 105.42965746993103,
          max: 148.22900526552291,
          sd: 32.53705013056317,
          avg: 77.01295465356547,
        }),
      },
    }),
    ...opts,
  });

export const createOrdersTaxField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: ORDERS.TAX,
    table_id: ORDERS_ID,
    name: "TAX",
    display_name: "Tax",
    base_type: "type/Float",
    effective_type: "type/Float",
    semantic_type: null,
    has_field_values: "none",
    fingerprint: createMockFingerprint({
      global: createMockGlobalFieldFingerprint({
        "distinct-count": 797,
      }),
      type: {
        "type/Number": createMockNumberFieldFingerprint({
          min: 0,
          q1: 2.273340386603857,
          q3: 5.337275338216307,
          max: 11.12,
          sd: 2.3206651358900316,
          avg: 3.8722100000000004,
        }),
      },
    }),
    ...opts,
  });

export const createOrdersTotalField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: ORDERS.TOTAL,
    table_id: ORDERS_ID,
    name: "TOTAL",
    display_name: "Total",
    base_type: "type/Float",
    effective_type: "type/Float",
    semantic_type: null,
    has_field_values: "none",
    fingerprint: createMockFingerprint({
      global: createMockGlobalFieldFingerprint({
        "distinct-count": 4426,
      }),
      type: {
        "type/Number": createMockNumberFieldFingerprint({
          min: 8.93914247937167,
          q1: 51.34535490743823,
          q3: 110.29428389265787,
          max: 159.34900526552292,
          sd: 34.26469575709948,
          avg: 80.35871658771228,
        }),
      },
    }),
    ...opts,
  });

export const createOrdersDiscountField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: ORDERS.DISCOUNT,
    table_id: ORDERS_ID,
    name: "DISCOUNT",
    display_name: "Discount",
    base_type: "type/Float",
    effective_type: "type/Float",
    semantic_type: "type/Discount",
    has_field_values: "none",
    fingerprint: createMockFingerprint({
      global: createMockGlobalFieldFingerprint({
        "distinct-count": 701,
        "nil%": 0.898,
      }),
      type: {
        "type/Number": createMockNumberFieldFingerprint({
          min: 0.17088996672584322,
          q1: 2.9786226681458743,
          q3: 7.338187788658235,
          max: 61.69684269960571,
          sd: 3.053663125001991,
          avg: 5.161255547580326,
        }),
      },
    }),
    ...opts,
  });

export const createOrdersCreatedAtField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: ORDERS.CREATED_AT,
    table_id: ORDERS_ID,
    name: "CREATED_AT",
    display_name: "Created At",
    base_type: "type/DateTime",
    effective_type: "type/DateTime",
    semantic_type: "type/CreationTimestamp",
    has_field_values: "none",
    fingerprint: createMockFingerprint({
      global: createMockGlobalFieldFingerprint({
        "distinct-count": 9998,
      }),
      type: {
        "type/DateTime": createMockDateTimeFieldFingerprint({
          earliest: "2016-04-30T18:56:13.352Z",
          latest: "2020-04-19T14:07:15.657Z",
        }),
      },
    }),
    ...opts,
  });

export const createOrdersQuantityField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: ORDERS.QUANTITY,
    table_id: ORDERS_ID,
    name: "QUANTITY",
    display_name: "Quantity",
    base_type: "type/Integer",
    effective_type: "type/Integer",
    semantic_type: "type/Quantity",
    fingerprint: createMockFingerprint({
      global: createMockGlobalFieldFingerprint({
        "distinct-count": 62,
      }),
      type: {
        "type/Number": createMockNumberFieldFingerprint({
          min: 0,
          q1: 1.755882607764982,
          q3: 4.882654507928044,
          max: 100,
          sd: 4.214258386403798,
          avg: 3.7015,
        }),
      },
    }),
    ...opts,
  });

export const createPeopleIdField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: PEOPLE.ID,
    table_id: PEOPLE_ID,
    name: "ID",
    display_name: "ID",
    base_type: "type/BigInteger",
    effective_type: "type/BigInteger",
    semantic_type: "type/PK",
    fingerprint: null,
    has_field_values: "none",
    ...opts,
  });

export const createPeopleAddressField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: PEOPLE.ADDRESS,
    table_id: PEOPLE_ID,
    name: "ADDRESS",
    display_name: "Address",
    base_type: "type/Text",
    effective_type: "type/Text",
    semantic_type: null,
    has_field_values: "search",
    fingerprint: createMockFingerprint({
      global: createMockGlobalFieldFingerprint({
        "distinct-count": 2490,
      }),
      type: {
        "type/Text": createMockTextFieldFingerprint({
          "average-length": 20.85,
        }),
      },
    }),
    ...opts,
  });

export const createPeopleEmailField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: PEOPLE.EMAIL,
    table_id: PEOPLE_ID,
    name: "EMAIL",
    display_name: "Email",
    base_type: "type/Text",
    effective_type: "type/Text",
    semantic_type: "type/Email",
    has_field_values: "search",
    fingerprint: createMockFingerprint({
      global: createMockGlobalFieldFingerprint({
        "distinct-count": 2500,
      }),
      type: {
        "type/Text": createMockTextFieldFingerprint({
          "percent-email": 1,
          "average-length": 24.1824,
        }),
      },
    }),
    ...opts,
  });

export const createPeoplePasswordField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: PEOPLE.PASSWORD,
    table_id: PEOPLE_ID,
    name: "PASSWORD",
    display_name: "Password",
    base_type: "type/Text",
    effective_type: "type/Text",
    semantic_type: null,

    // It's actually set to "search" in the original sample database,
    // but it's handy having a string field with no values for testing
    has_field_values: "none",

    fingerprint: createMockFingerprint({
      global: createMockGlobalFieldFingerprint({
        "distinct-count": 2500,
      }),
      type: {
        "type/Text": createMockTextFieldFingerprint({
          "average-length": 36,
        }),
      },
    }),
    ...opts,
  });

export const createPeopleNameField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: PEOPLE.NAME,
    table_id: PEOPLE_ID,
    name: "NAME",
    display_name: "Name",
    base_type: "type/Text",
    effective_type: "type/Text",
    semantic_type: "type/Name",
    has_field_values: "search",
    fingerprint: createMockFingerprint({
      global: createMockGlobalFieldFingerprint({
        "distinct-count": 2499,
      }),
      type: {
        "type/Text": createMockTextFieldFingerprint({
          "average-length": 13.532,
        }),
      },
    }),
    ...opts,
  });

export const createPeopleCityField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: PEOPLE.CITY,
    table_id: PEOPLE_ID,
    name: "CITY",
    display_name: "City",
    base_type: "type/Text",
    effective_type: "type/Text",
    semantic_type: "type/City",
    has_field_values: "search",
    fingerprint: createMockFingerprint({
      global: createMockGlobalFieldFingerprint({
        "distinct-count": 1966,
      }),
      type: {
        "type/Text": createMockTextFieldFingerprint({
          "percent-state": 0.002,
          "average-length": 8.284,
        }),
      },
    }),
    ...opts,
  });

export const createPeopleLongitudeField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: PEOPLE.LONGITUDE,
    table_id: PEOPLE_ID,
    name: "LONGITUDE",
    display_name: "Longitude",
    base_type: "type/Float",
    effective_type: "type/Float",
    semantic_type: "type/Longitude",
    has_field_values: "none",
    fingerprint: createMockFingerprint({
      global: createMockGlobalFieldFingerprint({
        "distinct-count": 2491,
      }),
      type: {
        "type/Number": createMockNumberFieldFingerprint({
          min: -166.5425726,
          q1: -101.58350792373135,
          q3: -84.65289348288829,
          max: -67.96735199999999,
          sd: 15.399698968175663,
          avg: -95.18741780363999,
        }),
      },
    }),
    ...opts,
  });

export const createPeopleStateField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: PEOPLE.STATE,
    table_id: PEOPLE_ID,
    name: "STATE",
    display_name: "State",
    base_type: "type/Text",
    effective_type: "type/Text",
    semantic_type: "type/State",
    fingerprint: createMockFingerprint({
      global: createMockGlobalFieldFingerprint({
        "distinct-count": 49,
      }),
      type: {
        "type/Text": createMockTextFieldFingerprint({
          "percent-state": 1,
          "average-length": 2,
        }),
      },
    }),
    ...opts,
  });

export const createPeopleSourceField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: PEOPLE.SOURCE,
    table_id: PEOPLE_ID,
    name: "SOURCE",
    display_name: "Source",
    base_type: "type/Text",
    effective_type: "type/Text",
    semantic_type: "type/Source",
    fingerprint: createMockFingerprint({
      global: createMockGlobalFieldFingerprint({
        "distinct-count": 5,
      }),
      type: {
        "type/Text": createMockTextFieldFingerprint({
          "average-length": 7.4084,
        }),
      },
    }),
    ...opts,
  });

export const createPeopleBirthDateField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: PEOPLE.BIRTH_DATE,
    table_id: PEOPLE_ID,
    name: "BIRTH_DATE",
    display_name: "Birth Date",
    base_type: "type/Date",
    effective_type: "type/Date",
    semantic_type: null,
    has_field_values: "none",
    fingerprint: createMockFingerprint({
      global: createMockGlobalFieldFingerprint({
        "distinct-count": 2308,
      }),
      type: {
        "type/DateTime": createMockDateTimeFieldFingerprint({
          earliest: "1958-04-26",
          latest: "2000-04-03",
        }),
      },
    }),
    ...opts,
  });

export const createPeopleZipField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: PEOPLE.ZIP,
    table_id: PEOPLE_ID,
    name: "ZIP",
    display_name: "Zip",
    base_type: "type/Text",
    effective_type: "type/Text",
    semantic_type: "type/ZipCode",
    has_field_values: "search",
    fingerprint: createMockFingerprint({
      global: createMockGlobalFieldFingerprint({
        "distinct-count": 2234,
      }),
      type: {
        "type/Text": createMockTextFieldFingerprint({
          "average-length": 5,
        }),
      },
    }),
    ...opts,
  });

export const createPeopleLatitudeField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: PEOPLE.LATITUDE,
    table_id: PEOPLE_ID,
    name: "LATITUDE",
    display_name: "Latitude",
    base_type: "type/Float",
    effective_type: "type/Float",
    semantic_type: "type/Latitude",
    has_field_values: "none",
    fingerprint: createMockFingerprint({
      global: createMockGlobalFieldFingerprint({
        "distinct-count": 2491,
      }),
      type: {
        "type/Number": createMockNumberFieldFingerprint({
          min: 25.775827,
          q1: 35.302705923023126,
          q3: 43.773802584662,
          max: 70.6355001,
          sd: 6.390832341883712,
          avg: 39.87934670484002,
        }),
      },
    }),
    ...opts,
  });

export const createPeopleCreatedAtField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: PEOPLE.CREATED_AT,
    table_id: PEOPLE_ID,
    name: "CREATED_AT",
    display_name: "Created At",
    base_type: "type/DateTime",
    effective_type: "type/Text",
    semantic_type: "type/CreationTimestamp",
    fingerprint: createMockFingerprint({
      global: createMockGlobalFieldFingerprint({
        "distinct-count": 2500,
        "nil%": 0,
      }),
      type: {
        "type/DateTime": createMockDateTimeFieldFingerprint({
          earliest: "2016-04-19T21:35:18.752Z",
          latest: "2019-04-19T14:06:27.3Z",
        }),
      },
    }),
    ...opts,
  });

export const createProductsIdField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: PRODUCTS.ID,
    table_id: PRODUCTS_ID,
    name: "ID",
    display_name: "ID",
    base_type: "type/BigInteger",
    effective_type: "type/BigInteger",
    semantic_type: "type/PK",
    has_field_values: "none",
    fingerprint: null,
    ...opts,
  });

export const createProductsEanField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: PRODUCTS.EAN,
    table_id: PRODUCTS_ID,
    name: "EAN",
    display_name: "Ean",
    base_type: "type/Text",
    effective_type: "type/Text",
    semantic_type: null,
    has_field_values: "none",
    fingerprint: createMockFingerprint({
      global: createMockGlobalFieldFingerprint({
        "distinct-count": 200,
      }),
      type: {
        "type/Text": createMockTextFieldFingerprint({
          "average-length": 13,
        }),
      },
    }),
    ...opts,
  });

export const createProductsTitleField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: PRODUCTS.TITLE,
    table_id: PRODUCTS_ID,
    name: "TITLE",
    display_name: "Title",
    base_type: "type/Text",
    effective_type: "type/Text",
    semantic_type: "type/Title",
    fingerprint: createMockFingerprint({
      global: createMockGlobalFieldFingerprint({
        "distinct-count": 199,
      }),
      type: {
        "type/Text": createMockTextFieldFingerprint({
          "average-length": 21.495,
        }),
      },
    }),
    ...opts,
  });

export const createProductsCategoryField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: PRODUCTS.CATEGORY,
    table_id: PRODUCTS_ID,
    name: "CATEGORY",
    display_name: "Category",
    base_type: "type/Text",
    effective_type: "type/Text",
    semantic_type: "type/Category",
    fingerprint: createMockFingerprint({
      global: createMockGlobalFieldFingerprint({
        "distinct-count": 4,
      }),
      type: {
        "type/Text": createMockTextFieldFingerprint({
          "average-length": 6.375,
        }),
      },
    }),
    ...opts,
  });

export const createProductsVendorField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: PRODUCTS.VENDOR,
    table_id: PRODUCTS_ID,
    name: "VENDOR",
    display_name: "Vendor",
    base_type: "type/Text",
    effective_type: "type/Text",
    semantic_type: "type/Company",
    has_field_values: "search",
    fingerprint: createMockFingerprint({
      global: createMockGlobalFieldFingerprint({
        "distinct-count": 200,
      }),
      type: {
        "type/Text": createMockTextFieldFingerprint({
          "average-length": 20.6,
        }),
      },
    }),
    ...opts,
  });

export const createProductsPriceField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: PRODUCTS.PRICE,
    table_id: PRODUCTS_ID,
    name: "PRICE",
    display_name: "Price",
    base_type: "type/Float",
    effective_type: "type/Float",
    semantic_type: null,
    has_field_values: "none",
    fingerprint: createMockFingerprint({
      global: createMockGlobalFieldFingerprint({
        "distinct-count": 170,
      }),
      type: {
        "type/Number": createMockNumberFieldFingerprint({
          min: 15.691943673970439,
          q1: 37.25154462926434,
          q3: 75.45898071609447,
          max: 98.81933684368194,
          sd: 21.711481557852057,
          avg: 55.74639966792074,
        }),
      },
    }),
    ...opts,
  });

export const createProductsRatingField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: PRODUCTS.RATING,
    table_id: PRODUCTS_ID,
    name: "RATING",
    display_name: "Rating",
    base_type: "type/Float",
    effective_type: "type/Float",
    semantic_type: "type/Score",
    has_field_values: "none",
    fingerprint: createMockFingerprint({
      global: createMockGlobalFieldFingerprint({
        "distinct-count": 23,
      }),
      type: {
        "type/Number": createMockNumberFieldFingerprint({
          min: 0,
          q1: 3.5120465053408525,
          q3: 4.216124969497314,
          max: 5,
          sd: 1.3605488657451452,
          avg: 3.4715,
        }),
      },
    }),
    ...opts,
  });

export const createProductsCreatedAtField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: PRODUCTS.CREATED_AT,
    table_id: PRODUCTS_ID,
    name: "CREATED_AT",
    display_name: "Created At",
    base_type: "type/DateTime",
    effective_type: "type/DateTime",
    semantic_type: "type/CreationTimestamp",
    has_field_values: "none",
    fingerprint: createMockFingerprint({
      global: createMockGlobalFieldFingerprint({
        "distinct-count": 200,
      }),
      type: {
        "type/DateTime": createMockDateTimeFieldFingerprint({
          earliest: "2016-04-26T19:29:55.147Z",
          latest: "2019-04-15T13:34:19.931Z",
        }),
      },
    }),
    ...opts,
  });

export const createReviewsIdField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: REVIEWS.ID,
    table_id: REVIEWS_ID,
    name: "ID",
    display_name: "ID",
    base_type: "type/BigInteger",
    semantic_type: "type/PK",
    has_field_values: "none",
    fingerprint: null,
    ...opts,
  });

export const createReviewsProductIdField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: REVIEWS.PRODUCT_ID,
    table_id: REVIEWS_ID,
    name: "PRODUCT_ID",
    display_name: "Product ID",
    base_type: "type/Integer",
    effective_type: "type/Integer",
    semantic_type: "type/FK",
    fk_target_field_id: PRODUCTS.ID,
    has_field_values: "none",
    fingerprint: createMockFingerprint({
      global: createMockGlobalFieldFingerprint({
        "distinct-count": 176,
        "nil%": 0,
      }),
    }),
    ...opts,
  });

export const createReviewsReviewerField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: REVIEWS.REVIEWER,
    table_id: REVIEWS_ID,
    name: "REVIEWER",
    display_name: "Reviewer",
    base_type: "type/Text",
    effective_type: "type/Text",
    semantic_type: null,
    has_field_values: "search",
    fingerprint: createMockFingerprint({
      global: createMockGlobalFieldFingerprint({
        "distinct-count": 1076,
      }),
      type: {
        "type/Text": createMockTextFieldFingerprint({
          "percent-state": 0.001798561151079137,
          "average-length": 9.972122302158274,
        }),
      },
    }),
    ...opts,
  });

export const createReviewsRatingField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: REVIEWS.RATING,
    table_id: REVIEWS_ID,
    name: "RATING",
    display_name: "Rating",
    base_type: "type/Integer",
    effective_type: "type/Integer",
    semantic_type: "type/Score",
    fingerprint: createMockFingerprint({
      global: createMockGlobalFieldFingerprint({
        "distinct-count": 5,
      }),
      type: {
        "type/Number": createMockNumberFieldFingerprint({
          min: 1,
          q1: 3.54744353181696,
          q3: 4.764807071650455,
          max: 5,
          sd: 1.0443899855660577,
          avg: 3.987410071942446,
        }),
      },
    }),
    ...opts,
  });

export const createReviewsBodyField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: REVIEWS.BODY,
    table_id: REVIEWS_ID,
    name: "BODY",
    display_name: "Body",
    base_type: "type/Text",
    effective_type: "type/Text",
    semantic_type: "type/Description",
    has_field_values: "search",
    fingerprint: createMockFingerprint({
      global: createMockGlobalFieldFingerprint({
        "distinct-count": 1112,
      }),
      type: {
        "type/Text": createMockTextFieldFingerprint({
          "average-length": 177.41996402877697,
        }),
      },
    }),
    ...opts,
  });

export const createReviewsCreatedAtField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: REVIEWS.CREATED_AT,
    table_id: REVIEWS_ID,
    name: "CREATED_AT",
    display_name: "Created At",
    base_type: "type/DateTime",
    effective_type: "type/DateTime",
    semantic_type: "type/CreationTimestamp",
    fingerprint: createMockFingerprint({
      global: createMockGlobalFieldFingerprint({
        "distinct-count": 1112,
      }),
      type: {
        "type/DateTime": createMockDateTimeFieldFingerprint({
          earliest: "2016-06-03T00:37:05.818Z",
          latest: "2020-04-19T14:15:25.677Z",
        }),
      },
    }),
    ...opts,
  });
