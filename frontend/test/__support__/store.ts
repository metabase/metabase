import { normalize } from "normalizr";
import {
  ActionSchema,
  CollectionSchema,
  DashboardSchema,
  DatabaseSchema,
  FieldSchema,
  QuestionSchema,
  SnippetSchema,
  TableSchema,
  UserSchema,
} from "metabase/schema";

import {
  Card,
  Collection,
  Dashboard,
  NativeQuerySnippet,
  User,
  WritebackAction,
} from "metabase-types/api";
import {
  EntitiesState,
  NormalizedDatabase,
  NormalizedField,
  NormalizedTable,
} from "metabase-types/store";

const SCHEMA = {
  actions: [ActionSchema],
  collections: [CollectionSchema],
  dashboards: [DashboardSchema],
  databases: [DatabaseSchema],
  tables: [TableSchema],
  fields: [FieldSchema],
  snippets: [SnippetSchema],
  users: [UserSchema],
  questions: [QuestionSchema],
};

export interface EntitiesStateOpts {
  actions?: WritebackAction[];
  collections?: Collection[];
  dashboards?: Dashboard[];
  databases?: NormalizedDatabase[];
  tables?: NormalizedTable[];
  fields?: NormalizedField[];
  snippets?: NativeQuerySnippet[];
  users?: User[];
  questions?: Card[];
}

export const createEntitiesState = (opts: EntitiesStateOpts): EntitiesState => {
  const schema = normalize(opts, SCHEMA);
  return schema.entities;
};
