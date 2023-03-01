import { Database, Field, Table } from "metabase-types/api";
import { createMockDatabase } from "./database";
import { createMockField } from "./field";
import { createMockTable } from "./table";

export const createSampleDatabase = (opts?: Partial<Database>): Database =>
  createMockDatabase({
    id: 1,
    name: "Sample Database",
    tables: [createOrdersTable(), createPeopleTable(), createProductTable()],
    is_sample: true,
    ...opts,
  });

export const createOrdersTable = (opts?: Partial<Table>): Table =>
  createMockTable({
    id: 1,
    db_id: 1,
    name: "ORDERS",
    display_name: "Orders",
    schema: "PUBLIC",
    fields: [
      createOrderCreatedAtField(),
      createOrderIdField(),
      createOrderProductIdField(),
      createOrderSubtotalField(),
      createOrderTaxField(),
      createOrderTotalField(),
      createOrderUserIdField(),
    ],
    ...opts,
  });

export const createPeopleTable = (opts?: Partial<Table>): Table =>
  createMockTable({
    id: 2,
    db_id: 1,
    name: "PEOPLE",
    display_name: "People",
    schema: "PUBLIC",
    fields: [
      createPeopleAddressField(),
      createPeopleBirthDateField(),
      createPeopleCityField(),
      createPeopleCreatedAtField(),
      createPeopleEmailField(),
      createPeopleIdField(),
      createPeopleLatitudeField(),
      createPeopleLongitudeField(),
      createPeopleNameField(),
      createPeoplePasswordField(),
      createPeopleSourceField(),
      createPeopleStateField(),
      createPeopleZipField(),
    ],
    ...opts,
  });

export const createProductTable = (opts?: Partial<Table>): Table =>
  createMockTable({
    id: 3,
    db_id: 1,
    name: "PRODUCTS",
    display_name: "Products",
    schema: "PUBLIC",
    fields: [
      createProductCategoryField(),
      createProductCreatedAtField(),
      createProductEanField(),
      createProductIdField(),
      createProductPriceField(),
      createProductRatingField(),
      createProductTitleField(),
      createProductVendorField(),
    ],
    ...opts,
  });

export const createReviewsTable = (opts?: Partial<Table>): Table =>
  createMockTable({
    id: 4,
    db_id: 1,
    name: "REVIEWS",
    display_name: "Reviews",
    schema: "PUBLIC",
    fields: [
      createReviewBodyField(),
      createReviewCreatedAtField(),
      createReviewIdField(),
      createReviewProductIdField(),
      createReviewRatingField(),
      createReviewReviewerField(),
    ],
    ...opts,
  });

export const createOrderCreatedAtField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 1,
    table_id: 1,
    name: "CREATED_AT",
    display_name: "Created At",
    base_type: "type/DateTime",
    semantic_type: "type/DateTime",
    ...opts,
  });

export const createOrderIdField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 2,
    table_id: 1,
    name: "ID",
    display_name: "ID",
    base_type: "type/BigInteger",
    semantic_type: "type/PK",
    ...opts,
  });

export const createOrderProductIdField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 3,
    table_id: 1,
    name: "PRODUCT_ID",
    display_name: "Product ID",
    base_type: "type/Integer",
    semantic_type: "type/FK",
    ...opts,
  });

export const createOrderSubtotalField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 4,
    table_id: 1,
    name: "SUBTOTAL",
    display_name: "Subtotal",
    base_type: "type/Float",
    semantic_type: "type/Float",
    ...opts,
  });

export const createOrderTaxField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 5,
    table_id: 1,
    name: "TAX",
    display_name: "Tax",
    base_type: "type/Float",
    semantic_type: "type/Float",
    ...opts,
  });

export const createOrderTotalField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 6,
    table_id: 1,
    name: "TOTAL",
    display_name: "Total",
    base_type: "type/Float",
    semantic_type: "type/Currency",
    ...opts,
  });

export const createOrderUserIdField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 7,
    table_id: 1,
    name: "USER_ID",
    display_name: "User Id",
    base_type: "type/Integer",
    semantic_type: "type/FK",
    ...opts,
  });

export const createPeopleAddressField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 8,
    table_id: 2,
    name: "ADDRESS",
    display_name: "Address",
    base_type: "type/Text",
    semantic_type: "type/Text",
    ...opts,
  });

export const createPeopleBirthDateField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 9,
    table_id: 2,
    name: "BIRTH_DATE",
    display_name: "Birth Date",
    base_type: "type/Date",
    semantic_type: "type/Date",
    ...opts,
  });

export const createPeopleCityField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 10,
    table_id: 2,
    name: "CITY",
    display_name: "City",
    base_type: "type/Text",
    semantic_type: "type/City",
    ...opts,
  });

export const createPeopleCreatedAtField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 11,
    table_id: 2,
    name: "CREATED_AT",
    display_name: "Created At",
    base_type: "type/DateTime",
    semantic_type: "type/DateTime",
    ...opts,
  });

export const createPeopleEmailField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 12,
    table_id: 2,
    name: "EMAIL",
    display_name: "Email",
    base_type: "type/Text",
    semantic_type: "type/Email",
    ...opts,
  });

export const createPeopleIdField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 13,
    table_id: 2,
    name: "ID",
    display_name: "ID",
    base_type: "type/BigInteger",
    semantic_type: "type/PK",
    ...opts,
  });

export const createPeopleLatitudeField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 14,
    table_id: 2,
    name: "LATITUDE",
    display_name: "Latitude",
    base_type: "type/Float",
    semantic_type: "type/Latitude",
    ...opts,
  });

export const createPeopleLongitudeField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 15,
    table_id: 2,
    name: "LONGITUDE",
    display_name: "Longitude",
    base_type: "type/Float",
    semantic_type: "type/Longitude",
    ...opts,
  });

export const createPeopleNameField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 16,
    table_id: 2,
    name: "NAME",
    display_name: "Name",
    base_type: "type/Text",
    semantic_type: "type/Name",
    ...opts,
  });

export const createPeoplePasswordField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 17,
    table_id: 2,
    name: "PASSWORD",
    display_name: "Password",
    base_type: "type/Text",
    semantic_type: "type/Text",
    ...opts,
  });

export const createPeopleSourceField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 18,
    table_id: 2,
    name: "SOURCE",
    display_name: "Source",
    base_type: "type/Text",
    semantic_type: "type/Category",
    ...opts,
  });

export const createPeopleStateField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 19,
    table_id: 2,
    name: "STATE",
    display_name: "State",
    base_type: "type/Text",
    semantic_type: "type/State",
    ...opts,
  });

export const createPeopleZipField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 20,
    table_id: 2,
    name: "ZIP",
    display_name: "Zip",
    base_type: "type/Text",
    semantic_type: "type/ZipCode",
    ...opts,
  });

export const createProductCategoryField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 21,
    table_id: 3,
    name: "CATEGORY",
    display_name: "Category",
    base_type: "type/Text",
    semantic_type: "type/Category",
    ...opts,
  });

export const createProductCreatedAtField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 22,
    table_id: 3,
    name: "CREATED_AT",
    display_name: "Created At",
    base_type: "type/DateTime",
    semantic_type: "type/DateTime",
    ...opts,
  });

export const createProductEanField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 23,
    table_id: 3,
    name: "EAN",
    display_name: "Ean",
    base_type: "type/Text",
    semantic_type: "type/Text",
    ...opts,
  });

export const createProductIdField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 24,
    table_id: 3,
    name: "ID",
    display_name: "ID",
    base_type: "type/BigInteger",
    semantic_type: "type/PK",
    ...opts,
  });

export const createProductPriceField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 25,
    table_id: 3,
    name: "PRICE",
    display_name: "Price",
    base_type: "type/Float",
    semantic_type: "type/Float",
    ...opts,
  });

export const createProductRatingField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 26,
    table_id: 3,
    name: "RATING",
    display_name: "Rating",
    base_type: "type/Float",
    semantic_type: "type/Category",
    ...opts,
  });

export const createProductTitleField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 27,
    table_id: 3,
    name: "TITLE",
    display_name: "Title",
    base_type: "type/Text",
    semantic_type: "type/Text",
    ...opts,
  });

export const createProductVendorField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 28,
    table_id: 3,
    name: "VENDOR",
    display_name: "Vendor",
    base_type: "type/Text",
    semantic_type: "type/Category",
    ...opts,
  });

export const createReviewBodyField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 29,
    table_id: 4,
    name: "BODY",
    display_name: "Body",
    base_type: "type/Text",
    semantic_type: "type/Description",
    ...opts,
  });

export const createReviewCreatedAtField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 30,
    table_id: 4,
    name: "CREATED_AT",
    display_name: "Created At",
    base_type: "type/DateTime",
    semantic_type: "type/DateTime",
    ...opts,
  });

export const createReviewIdField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 31,
    table_id: 4,
    name: "ID",
    display_name: "ID",
    base_type: "type/BigInteger",
    semantic_type: "type/PK",
    ...opts,
  });

export const createReviewProductIdField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 32,
    table_id: 4,
    name: "PRODUCT_ID",
    display_name: "Product ID",
    base_type: "type/Integer",
    semantic_type: "type/FK",
    ...opts,
  });

export const createReviewRatingField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 33,
    table_id: 4,
    name: "RATING",
    display_name: "Rating",
    base_type: "type/Integer",
    semantic_type: "type/Category",
    ...opts,
  });

export const createReviewReviewerField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: 34,
    table_id: 4,
    name: "REVIEWER",
    display_name: "Reviewer",
    base_type: "type/Text",
    semantic_type: "type/Text",
    ...opts,
  });
