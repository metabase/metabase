import { TYPE as cljs_TYPE } from "cljs/metabase.types";

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

// NOTE: be sure not to create cycles using the "other" types
export const TYPE_HIERARCHIES = {
  [TEMPORAL]: {
    base: [TYPE.Temporal],
    effective: [TYPE.Temporal],
    semantic: [TYPE.Temporal],
  },
  [NUMBER]: {
    base: [TYPE.Number],
    effective: [TYPE.Number],
    semantic: [TYPE.Number],
  },
  [INTEGER]: {
    base: [TYPE.Integer],
    effective: [TYPE.Integer],
  },
  [STRING]: {
    base: [TYPE.Text],
    effective: [TYPE.Text],
    semantic: [TYPE.Text, TYPE.Category],
  },
  [STRING_LIKE]: {
    base: [TYPE.TextLike],
    effective: [TYPE.TextLike],
  },
  [BOOLEAN]: {
    base: [TYPE.Boolean],
    effective: [TYPE.Boolean],
  },
  [COORDINATE]: {
    semantic: [TYPE.Coordinate],
  },
  [LOCATION]: {
    semantic: [TYPE.Address],
  },
  [ENTITY]: {
    semantic: [TYPE.FK, TYPE.PK, TYPE.Name],
  },
  [FOREIGN_KEY]: {
    semantic: [TYPE.FK],
  },
  [PRIMARY_KEY]: {
    semantic: [TYPE.PK],
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
    base: [TYPE.Boolean],
    effective: [TYPE.Boolean],
    semantic: [TYPE.Category],
    include: [LOCATION],
  },
  // NOTE: this is defunct right now.  see definition of isDimension below.
  [DIMENSION]: {
    include: [TEMPORAL, CATEGORY, ENTITY],
  },
};
