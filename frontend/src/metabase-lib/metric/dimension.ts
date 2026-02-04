import type { DimensionMetadata } from "./types";

type TypeFn = (dimension: DimensionMetadata) => boolean;

export const isBoolean: TypeFn = () => {
  throw new Error("Not implemented");
};

export const isCoordinate: TypeFn = () => {
  throw new Error("Not implemented");
};

export const isDateOrDateTime: TypeFn = () => {
  throw new Error("Not implemented");
};

export const isForeignKey: TypeFn = () => {
  throw new Error("Not implemented");
};

export const isLatitude: TypeFn = () => {
  throw new Error("Not implemented");
};

export const isLongitude: TypeFn = () => {
  throw new Error("Not implemented");
};

export const isNumeric: TypeFn = () => {
  throw new Error("Not implemented");
};

export const isPrimaryKey: TypeFn = () => {
  throw new Error("Not implemented");
};

export const isStringLike: TypeFn = () => {
  throw new Error("Not implemented");
};

export const isStringOrStringLike: TypeFn = () => {
  throw new Error("Not implemented");
};

export const isTime: TypeFn = () => {
  throw new Error("Not implemented");
};
