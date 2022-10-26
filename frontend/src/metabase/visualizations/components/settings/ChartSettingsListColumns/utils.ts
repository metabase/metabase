import type { Column } from "metabase-types/types/Dataset";

import {
  isAvatarURL,
  isEntityName,
  isCategory,
  isDescription,
  isDate,
  isNumeric,
  isPK,
} from "metabase-lib/lib/types/utils/isa";

const getIdOrRef = (column: Column | null) => column?.id ?? column?.field_ref;

const findA = (columns: Column[], predicate: (column: Column) => boolean) => {
  return columns.find(predicate);
};

export const getDefaultColumns = (columns: Column[]) => {
  const findInColumns = (predicate: (column: Column) => boolean) =>
    findA(columns, predicate);

  const imageCols = [
    findInColumns(isAvatarURL) ?? findInColumns(isEntityName) ?? null,
  ];
  const leftCols = [
    findInColumns(isEntityName) ?? findInColumns(isPK) ?? null,
    findInColumns(col => isCategory(col) && !isEntityName(col)) ?? null,
    findInColumns(isDescription) ?? null,
  ];
  const rightCols = [findInColumns(isDate) ?? findInColumns(isNumeric) ?? null];

  return {
    image: imageCols.filter(Boolean).map(getIdOrRef),
    left: leftCols.filter(Boolean).map(getIdOrRef),
    right: rightCols.filter(Boolean).map(getIdOrRef),
  };
};
