import { createSelector } from "reselect";
import { t } from "ttag";

import { getDatabases } from "metabase/reference/selectors";

export const getDatabasesSidebar = createSelector(
  getDatabases,
  databases => {
    const entities = (Object.values(databases) || []).map(database => ({
      ...database,
      icon: "database",
    }));
    return {
      entityGroups: [entities],
      entitySwitch: {
        value: "databases",
        options: [
          {
            name: t`Groups`,
            value: "groups",
          },
          {
            name: t`Databases`,
            value: "databases",
          },
        ],
      },
      filterPlaceholder: t`Search for a database`,
    };
  },
);
