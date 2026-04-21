import {
  LEVEL_ONE_TYPES as cljs_LEVEL_ONE_TYPES,
  TYPE as cljs_TYPE,
} from "cljs/metabase.types.core";

export const LEVEL_ONE_TYPES: string[] = cljs_LEVEL_ONE_TYPES;

export const TYPE: Record<string, string> = cljs_TYPE;

// primary field types used for picking operators, etc
export const NUMBER = "NUMBER";
export const INTEGER = "INTEGER";
export const STRING = "STRING";
export const STRING_LIKE = "STRING_LIKE";
export const BOOLEAN = "BOOLEAN";
export const TEMPORAL = "TEMPORAL";
export const LOCATION = "LOCATION";
export const COORDINATE = "COORDINATE";
export const FOREIGN_KEY = "FOREIGN_KEY";
export const PRIMARY_KEY = "PRIMARY_KEY";

// other types used for various purposes
const ENTITY = "ENTITY";
export const SUMMABLE = "SUMMABLE";
export const SCOPE = "SCOPE";
export const CATEGORY = "CATEGORY";
const DIMENSION = "DIMENSION";

export const UNKNOWN = "UNKNOWN";

export type FieldTypeKey =
  | typeof TEMPORAL
  | typeof NUMBER
  | typeof INTEGER
  | typeof STRING
  | typeof STRING_LIKE
  | typeof BOOLEAN
  | typeof COORDINATE
  | typeof LOCATION
  | typeof ENTITY
  | typeof FOREIGN_KEY
  | typeof PRIMARY_KEY
  | typeof SUMMABLE
  | typeof SCOPE
  | typeof CATEGORY
  | typeof DIMENSION;

export type Hierarchy = {
  base_type?: string[];
  effective_type?: string[];
  semantic_type?: string[];
  include?: FieldTypeKey[];
  exclude?: FieldTypeKey[];
};

// NOTE: be sure not to create cycles using the "other" types
export const TYPE_HIERARCHIES: Record<FieldTypeKey, Hierarchy> = {
  [TEMPORAL]: {
    base_type: [TYPE.Temporal],
    effective_type: [TYPE.Temporal],
  },
  [NUMBER]: {
    base_type: [TYPE.Number],
    effective_type: [TYPE.Number],
  },
  [INTEGER]: {
    base_type: [TYPE.Integer],
    effective_type: [TYPE.Integer],
  },
  [STRING]: {
    base_type: [TYPE.Text],
    effective_type: [TYPE.Text],
  },
  [STRING_LIKE]: {
    base_type: [TYPE.TextLike],
    effective_type: [TYPE.TextLike],
  },
  [BOOLEAN]: {
    base_type: [TYPE.Boolean],
    effective_type: [TYPE.Boolean],
  },
  [COORDINATE]: {
    semantic_type: [TYPE.Coordinate],
  },
  [LOCATION]: {
    semantic_type: [TYPE.Address],
  },
  [ENTITY]: {
    semantic_type: [TYPE.FK, TYPE.PK, TYPE.Name],
  },
  [FOREIGN_KEY]: {
    semantic_type: [TYPE.FK],
  },
  [PRIMARY_KEY]: {
    semantic_type: [TYPE.PK],
  },
  [SUMMABLE]: {
    include: [NUMBER],
    exclude: [ENTITY, LOCATION, TEMPORAL],
  },
  [SCOPE]: {
    include: [NUMBER, TEMPORAL, CATEGORY, ENTITY, STRING],
    exclude: [LOCATION],
  },
  [CATEGORY]: {
    semantic_type: [TYPE.Category],
  },
  // NOTE: this is defunct right now.  see definition of isDimension below.
  [DIMENSION]: {
    include: [TEMPORAL, CATEGORY, ENTITY],
  },
};
