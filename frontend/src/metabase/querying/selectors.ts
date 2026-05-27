import { createSelector } from "@reduxjs/toolkit";
import _ from "underscore";

import type { State } from "metabase/redux/store";
import { getMetadata } from "metabase/selectors/metadata";
import type Database from "metabase-lib/v1/metadata/Database";

export const getDatabasesList = (state: State): Database[] =>
  getMetadata(state).databasesList();

export const getSampleDatabaseId = createSelector(
  [getDatabasesList],
  (databases): number | undefined => {
    const sampleDatabase = _.findWhere(databases, { is_sample: true });
    return sampleDatabase?.id;
  },
);
