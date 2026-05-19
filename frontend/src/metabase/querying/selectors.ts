import { createSelector } from "@reduxjs/toolkit";
import _ from "underscore";

import { Databases } from "metabase/entities/databases";
import type { State } from "metabase/redux/store";
import type { Database } from "metabase-types/api";

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
