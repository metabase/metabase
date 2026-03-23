import { createSelector } from "@reduxjs/toolkit";
import _ from "underscore";

import { Databases } from "metabase/entities/databases";
import type { Database } from "metabase-types/api";
import type { State } from "metabase-types/store";

const getDatabasesListDefaultValue: Database[] = [];

export const getDatabasesList = (state: State): Database[] =>
  Databases.selectors.getList(state, {
    entityQuery: { include: "tables", saved: true },
  }) || getDatabasesListDefaultValue;

export const getSampleDatabaseId = createSelector(
  [getDatabasesList],
  (databases): number | undefined => {
    const sampleDatabase = _.findWhere(databases, { is_sample: true });
    return sampleDatabase?.id;
  },
);
