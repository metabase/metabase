/* eslint-disable react/prop-types */
import { jt, msgid, ngettext, t } from "ttag";

import { DataPermissionValue } from "metabase/admin/permissions/types";
import CS from "metabase/css/core/index.css";
import { Tooltip } from "metabase/ui";

const GroupName = ({ group }) => (
  <span className={CS.textBrand}>{group.name}</span>
);

const DatabaseName = ({ database }) => (
  <span className={CS.textBrand}>{database.name}</span>
);

const TableAccessChange = ({ tables, verb, colorClassName }) => {
  const tableEntries = Object.entries(tables);
  return (
    <span>
      {verb}
      <Tooltip
        label={
          <div className={CS.p1}>
            {tableEntries.map(([id, table]) => (
              <div key={id}>{table.name}</div>
            ))}
          </div>
        }
      >
        <span>
          <span className={colorClassName}>
            {" " +
              ((n) => ngettext(msgid`${n} table`, `${n} tables`, n))(
                tableEntries.length,
              )}
          </span>
        </span>
      </Tooltip>
    </span>
  );
};

export const PermissionsConfirm = ({ diff }) => (
  <div>
    {Object.values(diff.groups).map((group, groupIndex) =>
      Object.values(group.databases).map((database, databaseIndex) => (
        <div key={`${groupIndex}:${databaseIndex}`}>
          {(database.grantedTables || database.revokedTables) && (
            <div>
              <GroupName group={group} />
              {t` will be `}
              {database.grantedTables && (
                <TableAccessChange
                  verb={t`given access to`}
                  colorClassName={CS.textSuccess}
                  tables={database.grantedTables}
                />
              )}
              {database.grantedTables && database.revokedTables && t` and `}
              {database.revokedTables && (
                <TableAccessChange
                  verb={t`denied access to`}
                  colorClassName={CS.textError}
                  tables={database.revokedTables}
                />
              )}
              {" in "}
              <DatabaseName database={database} />
              {"."}
            </div>
          )}
          {database.native && (
            <div>
              {database.native === DataPermissionValue.QUERY_BUILDER &&
                jt`${(
                  <GroupName key="group-name" group={group} />
                )} will only be able to use the query
                  builder for ${(<DatabaseName key="database-name" database={database} />)}.`}
              {database.native ===
                DataPermissionValue.QUERY_BUILDER_AND_NATIVE &&
                jt`${(
                  <GroupName key="group-name" group={group} />
                )} will be able to use the query builder and write native queries for ${(
                  <DatabaseName key="database-name" database={database} />
                )}.`}
              {database.native === DataPermissionValue.NO &&
                jt`${(
                  <GroupName key="group-name" group={group} />
                )} will not be able to use the query builder or write native queries for ${(
                  <DatabaseName key="database-name" database={database} />
                )}.`}
              {database.native === DataPermissionValue.CONTROLLED &&
                jt`${(
                  <GroupName key="group-name" group={group} />
                )} will have granular query creation permissions for ${(
                  <DatabaseName key="database-name" database={database} />
                )}.`}
            </div>
          )}
        </div>
      )),
    )}
  </div>
);
