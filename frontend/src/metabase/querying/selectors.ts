import { createSelector } from "@reduxjs/toolkit";
import _ from "underscore";

import { getMetadata } from "metabase/selectors/metadata";

export const getDatabasesList = createSelector([getMetadata], (metadata) =>
  metadata.databasesList(),
);

export const getSampleDatabaseId = createSelector(
  [getDatabasesList],
  (databases): number | undefined => {
    const sampleDatabase = _.findWhere(databases, { is_sample: true });
    return sampleDatabase?.id;
  },
);
