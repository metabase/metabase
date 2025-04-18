import { t } from "ttag";

export const DATA_COLUMNS = [
  {
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    name: t`Download results`,
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    hint: t`Downloads of native queries are only allowed if a group has download permissions for the entire database.`,
  },
  {
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    name: t`Manage table metadata`,
  },
];
