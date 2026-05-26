import { createSelector } from "@reduxjs/toolkit";
import _ from "underscore";

import { getMetadata } from "metabase/selectors/metadata";
import type Database from "metabase-lib/v1/metadata/Database";

// Memoized: `Metadata#databasesList()` builds a fresh array on every call, so
// a plain selector would return a new reference each time and break
// downstream `createSelector` memoization (reselect input stability check).
export const getDatabasesList = createSelector(
  [getMetadata],
  (metadata): Database[] => metadata.databasesList(),
);

export const getSampleDatabaseId = createSelector(
  [getDatabasesList],
  (databases): number | undefined => {
    const sampleDatabase = _.findWhere(databases, { is_sample: true });
    return sampleDatabase?.id;
  },
);
