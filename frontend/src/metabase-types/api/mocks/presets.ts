import { Database, Field, Table } from "metabase-types/api";
import { createMockDatabase } from "./database";
import { createMockField } from "./field";
import { createMockTable } from "./table";

export const SAMPLE_DB_ID = 1;
export const ORDERS_ID = 2;
export const PEOPLE_ID = 5;
export const PRODUCTS_ID = 1;
export const REVIEWS_ID = 8;

export const createSampleDatabase = (opts?: Partial<Database>): Database =>
  createMockDatabase({
    id: SAMPLE_DB_ID,
    name: "Sample Database",
    tables: [
      createOrdersTable(),
      createPeopleTable(),
      createProductTable(),
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
      createOrderIdField(),
      createOrderUserIdField(),
      createOrderProductIdField(),
      createOrderSubtotalField(),
      createOrderTaxField(),
      createOrderTotalField(),
      createOrderDiscountField(),
      createOrderCreatedAtField(),
      createOrderQuantityField(),
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

export const createProductTable = (opts?: Partial<Table>): Table =>
  createMockTable({
    id: PRODUCTS_ID,
    db_id: SAMPLE_DB_ID,
    name: "PRODUCTS",
    display_name: "Products",
    schema: "PUBLIC",
    fields: [
      createProductIdField(),
      createProductEanField(),
      createProductTitleField(),
      createProductCategoryField(),
      createProductVendorField(),
      createProductPriceField(),
      createProductRatingField(),
      createProductCreatedAtField(),
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
      createReviewIdField(),
      createReviewProductIdField(),
      createReviewReviewerField(),
      createReviewRatingField(),
      createReviewBodyField(),
      createReviewCreatedAtField(),
    ],
    ...opts,
  });

export const createOrderIdField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 11,
    table_id: ORDERS_ID,
    name: "ID",
    display_name: "ID",
    base_type: "type/BigInteger",
    semantic_type: "type/PK",
    ...opts,
  });

export const createOrderUserIdField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 15,
    table_id: ORDERS_ID,
    name: "USER_ID",
    display_name: "User Id",
    base_type: "type/Integer",
    semantic_type: "type/FK",
    ...opts,
  });

export const createOrderProductIdField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 9,
    table_id: ORDERS_ID,
    name: "PRODUCT_ID",
    display_name: "Product ID",
    base_type: "type/Integer",
    semantic_type: "type/FK",
    ...opts,
  });

export const createOrderSubtotalField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 16,
    table_id: ORDERS_ID,
    name: "SUBTOTAL",
    display_name: "Subtotal",
    base_type: "type/Float",
    semantic_type: null,
    ...opts,
  });

export const createOrderTaxField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 10,
    table_id: ORDERS_ID,
    name: "TAX",
    display_name: "Tax",
    base_type: "type/Float",
    semantic_type: null,
    ...opts,
  });

export const createOrderTotalField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 13,
    table_id: ORDERS_ID,
    name: "TOTAL",
    display_name: "Total",
    base_type: "type/Float",
    semantic_type: null,
    ...opts,
  });

export const createOrderDiscountField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 17,
    table_id: ORDERS_ID,
    name: "DISCOUNT",
    display_name: "Discount",
    base_type: "type/Float",
    semantic_type: null,
    ...opts,
  });

export const createOrderCreatedAtField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 14,
    table_id: ORDERS_ID,
    name: "CREATED_AT",
    display_name: "Created At",
    base_type: "type/DateTime",
    semantic_type: "type/CreationTimestamp",
    ...opts,
  });

export const createOrderQuantityField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 12,
    table_id: ORDERS_ID,
    name: "QUANTITY",
    display_name: "Quantity",
    base_type: "type/Integer",
    semantic_type: "type/Quantity",
    ...opts,
  });

export const createPeopleIdField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 32,
    table_id: 5,
    name: "ID",
    display_name: "ID",
    base_type: "type/BigInteger",
    semantic_type: "type/PK",
    ...opts,
  });

export const createPeopleAddressField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 42,
    table_id: 5,
    name: "ADDRESS",
    display_name: "Address",
    base_type: "type/Text",
    semantic_type: null,
    ...opts,
  });

export const createPeopleEmailField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 37,
    table_id: 5,
    name: "EMAIL",
    display_name: "Email",
    base_type: "type/Text",
    semantic_type: "type/Email",
    ...opts,
  });

export const createPeoplePasswordField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 34,
    table_id: 5,
    name: "PASSWORD",
    display_name: "Password",
    base_type: "type/Text",
    semantic_type: null,
    ...opts,
  });

export const createPeopleNameField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 39,
    table_id: 5,
    name: "NAME",
    display_name: "Name",
    base_type: "type/Text",
    semantic_type: "type/Name",
    ...opts,
  });

export const createPeopleCityField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 31,
    table_id: 5,
    name: "CITY",
    display_name: "City",
    base_type: "type/Text",
    semantic_type: "type/City",
    ...opts,
  });

export const createPeopleLongitudeField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 40,
    table_id: 5,
    name: "LONGITUDE",
    display_name: "Longitude",
    base_type: "type/Float",
    semantic_type: "type/Longitude",
    ...opts,
  });

export const createPeopleStateField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 33,
    table_id: 5,
    name: "STATE",
    display_name: "State",
    base_type: "type/Text",
    semantic_type: "type/State",
    ...opts,
  });

export const createPeopleSourceField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 36,
    table_id: 5,
    name: "SOURCE",
    display_name: "Source",
    base_type: "type/Text",
    semantic_type: "type/Source",
    ...opts,
  });

export const createPeopleBirthDateField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 35,
    table_id: 5,
    name: "BIRTH_DATE",
    display_name: "Birth Date",
    base_type: "type/Date",
    semantic_type: null,
    ...opts,
  });

export const createPeopleZipField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 43,
    table_id: 5,
    name: "ZIP",
    display_name: "Zip",
    base_type: "type/Text",
    semantic_type: "type/ZipCode",
    ...opts,
  });

export const createPeopleLatitudeField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 41,
    table_id: 5,
    name: "LATITUDE",
    display_name: "Latitude",
    base_type: "type/Float",
    semantic_type: "type/Latitude",
    ...opts,
  });

export const createPeopleCreatedAtField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 38,
    table_id: 5,
    name: "CREATED_AT",
    display_name: "Created At",
    base_type: "type/DateTime",
    semantic_type: "type/CreationTimestamp",
    ...opts,
  });

export const createProductIdField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 3,
    table_id: PRODUCTS_ID,
    name: "ID",
    display_name: "ID",
    base_type: "type/BigInteger",
    semantic_type: "type/PK",
    ...opts,
  });

export const createProductEanField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 5,
    table_id: PRODUCTS_ID,
    name: "EAN",
    display_name: "Ean",
    base_type: "type/Text",
    semantic_type: null,
    ...opts,
  });

export const createProductTitleField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 8,
    table_id: PRODUCTS_ID,
    name: "TITLE",
    display_name: "Title",
    base_type: "type/Text",
    semantic_type: "type/Title",
    ...opts,
  });

export const createProductCategoryField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 1,
    table_id: PRODUCTS_ID,
    name: "CATEGORY",
    display_name: "Category",
    base_type: "type/Text",
    semantic_type: "type/Category",
    ...opts,
  });

export const createProductVendorField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 4,
    table_id: PRODUCTS_ID,
    name: "VENDOR",
    display_name: "Vendor",
    base_type: "type/Text",
    semantic_type: "type/Company",
    ...opts,
  });

export const createProductPriceField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 7,
    table_id: PRODUCTS_ID,
    name: "PRICE",
    display_name: "Price",
    base_type: "type/Float",
    semantic_type: null,
    ...opts,
  });

export const createProductRatingField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 2,
    table_id: PRODUCTS_ID,
    name: "RATING",
    display_name: "Rating",
    base_type: "type/Float",
    semantic_type: "type/Score",
    ...opts,
  });

export const createProductCreatedAtField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 6,
    table_id: PRODUCTS_ID,
    name: "CREATED_AT",
    display_name: "Created At",
    base_type: "type/DateTime",
    semantic_type: "type/CreationTimestamp",
    ...opts,
  });

export const createReviewIdField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 67,
    table_id: REVIEWS_ID,
    name: "ID",
    display_name: "ID",
    base_type: "type/BigInteger",
    semantic_type: "type/PK",
    ...opts,
  });

export const createReviewProductIdField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 68,
    table_id: REVIEWS_ID,
    name: "PRODUCT_ID",
    display_name: "Product ID",
    base_type: "type/Integer",
    semantic_type: "type/FK",
    ...opts,
  });

export const createReviewReviewerField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 69,
    table_id: REVIEWS_ID,
    name: "REVIEWER",
    display_name: "Reviewer",
    base_type: "type/Text",
    semantic_type: null,
    ...opts,
  });

export const createReviewRatingField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 66,
    table_id: REVIEWS_ID,
    name: "RATING",
    display_name: "Rating",
    base_type: "type/Integer",
    semantic_type: "type/Score",
    ...opts,
  });

export const createReviewBodyField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 70,
    table_id: REVIEWS_ID,
    name: "BODY",
    display_name: "Body",
    base_type: "type/Text",
    semantic_type: "type/Description",
    ...opts,
  });

export const createReviewCreatedAtField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 71,
    table_id: REVIEWS_ID,
    name: "CREATED_AT",
    display_name: "Created At",
    base_type: "type/DateTime",
    semantic_type: "type/CreationTimestamp",
    ...opts,
  });
