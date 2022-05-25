import { DimensionOption } from "metabase-lib/lib/queries/StructuredQuery";

const LONG_TEXT_MIN = 80;

type PriorityMap = { [key: string]: number | undefined };

const fieldSortPriorities: PriorityMap = {
  "type/CreationTimestamp": 10,
  "type/Boolean": 20,
  "type/Category": 30,
  "type/Currency": 40,
  "type/Location": 50,
  "type/Address": 50,
  "type/City": 51,
  "type/State": 52,
  "type/ZipCode": 53,
  "type/Country": 54,
  "type/Float": 60,
  "type/BigInteger": 60,
  "type/Integer": 60,
  "type/Text": 70,
  "type/Date": 80,
  "type/PK": 90,
  "type/Latitude": 210,
  "type/Longitude": 211,
  "type/LongText": 220,
  "type/FK": 230,
  "type/JSON": 240,
  "": undefined,
};

const getSortValue = (dimensionOption: DimensionOption): number => {
  const field = dimensionOption.dimension.field();

  const isLongText =
    field?.fingerprint?.type?.["type/Text"]?.["average-length"] >=
    LONG_TEXT_MIN;

  if (isLongText) {
    field.semantic_type = "type/LongText";
  }

  return (
    fieldSortPriorities[field.semantic_type ?? ""] ??
    fieldSortPriorities[field.base_type ?? ""] ??
    900
  );
};

export const sortDimensions = (a: DimensionOption, b: DimensionOption) =>
  getSortValue(a) - getSortValue(b);
