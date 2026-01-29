import { normalize } from "normalizr";

import { EntitiesSchema } from "metabase/schema";
import type {
  Card,
  Collection,
  Dashboard,
  Database,
  Field,
  NativeQuerySnippet,
  SavedQuestionDatabase,
  Schema,
  Segment,
  Table,
  User,
  WritebackAction,
} from "metabase-types/api";
import type { EntitiesState } from "metabase-types/store";
import { createMockNormalizedEntitiesState } from "metabase-types/store/mocks";

export interface EntitiesStateOpts {
  actions?: WritebackAction[];
  collections?: Collection[];
  dashboards?: Dashboard[];
  databases?: (Database | SavedQuestionDatabase)[];
  schemas?: Schema[];
  tables?: Table[];
  fields?: Field[];
  segments?: Segment[];
  snippets?: NativeQuerySnippet[];
  users?: User[];
  questions?: Card[];
}

export const createMockEntitiesState = (
  opts: EntitiesStateOpts,
): EntitiesState => {
  const schema = normalize(opts, EntitiesSchema);
  return {
    ...createMockNormalizedEntitiesState(),
    ...schema.entities,
  };
};
