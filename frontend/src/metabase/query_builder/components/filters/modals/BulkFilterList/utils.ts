import { DimensionOption } from "metabase-lib/lib/queries/StructuredQuery";

import { isDate } from "metabase/lib/schema_metadata";

import { LONG_TEXT_MIN } from "metabase-lib/lib/metadata/Field";

type PriorityMap = { [key: string]: number | undefined };

const fieldSortPriorities: PriorityMap = {
  "type/CreationTemporal": 10,
  "type/CreationTimestamp": 10,
  "type/CreationDate": 10,
  "type/CreationTime": 11,
  "type/Date": 12,
  "type/Boolean": 20,
  "type/Category": 30,
  "type/Currency": 40,
  "type/Price": 40,
  "type/Discount": 40,
  "type/GrossMargin": 40,
  "type/Cost": 40,
  "type/Location": 50,
  "type/Address": 50,
  "type/City": 51,
  "type/State": 52,
  "type/ZipCode": 53,
  "type/Country": 54,
  "type/Number": 60,
  "type/Float": 60,
  "type/BigInteger": 60,
  "type/Integer": 60,
  "type/Text": 70,
  "type/PK": 90,
  "type/Latitude": 210,
  "type/Longitude": 211,
  "type/LongText": 220, // not a "real" metabase type, but having it as part of this list makes it easier to sort
  "type/FK": 230,
  "type/JSON": 240,
  "": undefined,
};

const getSortValue = (dimensionOption: DimensionOption): number => {
  const field = dimensionOption.dimension.field();

  return (
    (field.isLongText() ? fieldSortPriorities["type/LongText"] : undefined) ??
    fieldSortPriorities[field.semantic_type ?? ""] ??
    (isDate(field) ? fieldSortPriorities["type/Date"] : undefined) ??
    fieldSortPriorities[field.base_type ?? ""] ??
    900
  );
};

export const sortDimensions = (a: DimensionOption, b: DimensionOption) =>
  getSortValue(a) - getSortValue(b);

export const isDimensionValid = (dimensionOption: DimensionOption) =>
  dimensionOption.dimension.field().base_type !== "type/Structured";
