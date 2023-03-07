import { Database, Field, Table } from "metabase-types/api";
import {
  createMockDatabase,
  createMockTable,
  createMockField,
} from "metabase-types/api/mocks";

export const SAMPLE_DB_ID = 1;
export const ORDERS_ID = 2;
export const PEOPLE_ID = 5;
export const PRODUCTS_ID = 1;
export const REVIEWS_ID = 8;

export const ORDERS = {
  ID: 11,
  USER_ID: 15,
  PRODUCTS_ID: 9,
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
    semantic_type: "type/PK",
    ...opts,
  });

export const createOrdersUserIdField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: ORDERS.USER_ID,
    table_id: ORDERS_ID,
    name: "USER_ID",
    display_name: "User Id",
    base_type: "type/Integer",
    semantic_type: "type/FK",
    ...opts,
  });

export const createOrdersProductIdField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: ORDERS.PRODUCTS_ID,
    table_id: ORDERS_ID,
    name: "PRODUCT_ID",
    display_name: "Product ID",
    base_type: "type/Integer",
    semantic_type: "type/FK",
    ...opts,
  });

export const createOrdersSubtotalField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: ORDERS.SUBTOTAL,
    table_id: ORDERS_ID,
    name: "SUBTOTAL",
    display_name: "Subtotal",
    base_type: "type/Float",
    semantic_type: null,
    ...opts,
  });

export const createOrdersTaxField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: ORDERS.TAX,
    table_id: ORDERS_ID,
    name: "TAX",
    display_name: "Tax",
    base_type: "type/Float",
    semantic_type: null,
    ...opts,
  });

export const createOrdersTotalField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: ORDERS.TOTAL,
    table_id: ORDERS_ID,
    name: "TOTAL",
    display_name: "Total",
    base_type: "type/Float",
    semantic_type: null,
    ...opts,
  });

export const createOrdersDiscountField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: ORDERS.DISCOUNT,
    table_id: ORDERS_ID,
    name: "DISCOUNT",
    display_name: "Discount",
    base_type: "type/Float",
    semantic_type: null,
    ...opts,
  });

export const createOrdersCreatedAtField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: ORDERS.CREATED_AT,
    table_id: ORDERS_ID,
    name: "CREATED_AT",
    display_name: "Created At",
    base_type: "type/DateTime",
    semantic_type: "type/CreationTimestamp",
    ...opts,
  });

export const createOrdersQuantityField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: ORDERS.QUANTITY,
    table_id: ORDERS_ID,
    name: "QUANTITY",
    display_name: "Quantity",
    base_type: "type/Integer",
    semantic_type: "type/Quantity",
    ...opts,
  });

export const createPeopleIdField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: PEOPLE.ID,
    table_id: PEOPLE_ID,
    name: "ID",
    display_name: "ID",
    base_type: "type/BigInteger",
    semantic_type: "type/PK",
    ...opts,
  });

export const createPeopleAddressField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: PEOPLE.ADDRESS,
    table_id: PEOPLE_ID,
    name: "ADDRESS",
    display_name: "Address",
    base_type: "type/Text",
    semantic_type: null,
    ...opts,
  });

export const createPeopleEmailField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: PEOPLE.EMAIL,
    table_id: PEOPLE_ID,
    name: "EMAIL",
    display_name: "Email",
    base_type: "type/Text",
    semantic_type: "type/Email",
    ...opts,
  });

export const createPeoplePasswordField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: PEOPLE.PASSWORD,
    table_id: PEOPLE_ID,
    name: "PASSWORD",
    display_name: "Password",
    base_type: "type/Text",
    semantic_type: null,
    ...opts,
  });

export const createPeopleNameField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: PEOPLE.NAME,
    table_id: PEOPLE_ID,
    name: "NAME",
    display_name: "Name",
    base_type: "type/Text",
    semantic_type: "type/Name",
    ...opts,
  });

export const createPeopleCityField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: PEOPLE.CITY,
    table_id: PEOPLE_ID,
    name: "CITY",
    display_name: "City",
    base_type: "type/Text",
    semantic_type: "type/City",
    ...opts,
  });

export const createPeopleLongitudeField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: PEOPLE.LONGITUDE,
    table_id: PEOPLE_ID,
    name: "LONGITUDE",
    display_name: "Longitude",
    base_type: "type/Float",
    semantic_type: "type/Longitude",
    ...opts,
  });

export const createPeopleStateField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: PEOPLE.STATE,
    table_id: PEOPLE_ID,
    name: "STATE",
    display_name: "State",
    base_type: "type/Text",
    semantic_type: "type/State",
    ...opts,
  });

export const createPeopleSourceField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: PEOPLE.SOURCE,
    table_id: PEOPLE_ID,
    name: "SOURCE",
    display_name: "Source",
    base_type: "type/Text",
    semantic_type: "type/Source",
    ...opts,
  });

export const createPeopleBirthDateField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: PEOPLE.BIRTH_DATE,
    table_id: PEOPLE_ID,
    name: "BIRTH_DATE",
    display_name: "Birth Date",
    base_type: "type/Date",
    semantic_type: null,
    ...opts,
  });

export const createPeopleZipField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: PEOPLE.ZIP,
    table_id: PEOPLE_ID,
    name: "ZIP",
    display_name: "Zip",
    base_type: "type/Text",
    semantic_type: "type/ZipCode",
    ...opts,
  });

export const createPeopleLatitudeField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: PEOPLE.LATITUDE,
    table_id: PEOPLE_ID,
    name: "LATITUDE",
    display_name: "Latitude",
    base_type: "type/Float",
    semantic_type: "type/Latitude",
    ...opts,
  });

export const createPeopleCreatedAtField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: PEOPLE.CREATED_AT,
    table_id: PEOPLE_ID,
    name: "CREATED_AT",
    display_name: "Created At",
    base_type: "type/DateTime",
    semantic_type: "type/CreationTimestamp",
    ...opts,
  });

export const createProductsIdField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: PRODUCTS.ID,
    table_id: PRODUCTS_ID,
    name: "ID",
    display_name: "ID",
    base_type: "type/BigInteger",
    semantic_type: "type/PK",
    ...opts,
  });

export const createProductsEanField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: PRODUCTS.EAN,
    table_id: PRODUCTS_ID,
    name: "EAN",
    display_name: "Ean",
    base_type: "type/Text",
    semantic_type: null,
    ...opts,
  });

export const createProductsTitleField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: PRODUCTS.TITLE,
    table_id: PRODUCTS_ID,
    name: "TITLE",
    display_name: "Title",
    base_type: "type/Text",
    semantic_type: "type/Title",
    ...opts,
  });

export const createProductsCategoryField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: PRODUCTS.CATEGORY,
    table_id: PRODUCTS_ID,
    name: "CATEGORY",
    display_name: "Category",
    base_type: "type/Text",
    semantic_type: "type/Category",
    ...opts,
  });

export const createProductsVendorField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: PRODUCTS.VENDOR,
    table_id: PRODUCTS_ID,
    name: "VENDOR",
    display_name: "Vendor",
    base_type: "type/Text",
    semantic_type: "type/Company",
    ...opts,
  });

export const createProductsPriceField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: PRODUCTS.PRICE,
    table_id: PRODUCTS_ID,
    name: "PRICE",
    display_name: "Price",
    base_type: "type/Float",
    semantic_type: null,
    ...opts,
  });

export const createProductsRatingField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: PRODUCTS.RATING,
    table_id: PRODUCTS_ID,
    name: "RATING",
    display_name: "Rating",
    base_type: "type/Float",
    semantic_type: "type/Score",
    ...opts,
  });

export const createProductsCreatedAtField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: PRODUCTS.CREATED_AT,
    table_id: PRODUCTS_ID,
    name: "CREATED_AT",
    display_name: "Created At",
    base_type: "type/DateTime",
    semantic_type: "type/CreationTimestamp",
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
    ...opts,
  });

export const createReviewsProductIdField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: REVIEWS.PRODUCT_ID,
    table_id: REVIEWS_ID,
    name: "PRODUCT_ID",
    display_name: "Product ID",
    base_type: "type/Integer",
    semantic_type: "type/FK",
    ...opts,
  });

export const createReviewsReviewerField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: REVIEWS.REVIEWER,
    table_id: REVIEWS_ID,
    name: "REVIEWER",
    display_name: "Reviewer",
    base_type: "type/Text",
    semantic_type: null,
    ...opts,
  });

export const createReviewsRatingField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: REVIEWS.RATING,
    table_id: REVIEWS_ID,
    name: "RATING",
    display_name: "Rating",
    base_type: "type/Integer",
    semantic_type: "type/Score",
    ...opts,
  });

export const createReviewsBodyField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: REVIEWS.BODY,
    table_id: REVIEWS_ID,
    name: "BODY",
    display_name: "Body",
    base_type: "type/Text",
    semantic_type: "type/Description",
    ...opts,
  });

export const createReviewsCreatedAtField = (opts?: Partial<Field>): Field =>
  createMockField({
    id: REVIEWS.CREATED_AT,
    table_id: REVIEWS_ID,
    name: "CREATED_AT",
    display_name: "Created At",
    base_type: "type/DateTime",
    semantic_type: "type/CreationTimestamp",
    ...opts,
  });
