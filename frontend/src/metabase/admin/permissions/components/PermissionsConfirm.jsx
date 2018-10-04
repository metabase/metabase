import React from "react";

import { t, ngettext, msgid } from "c-3po";
import Tooltip from "metabase/components/Tooltip";

const GroupName = ({ group }) => (
  <span className="text-brand">{group.name}</span>
);

const DatabaseName = ({ database }) => (
  <span className="text-brand">{database.name}</span>
);

const TableAccessChange = ({ tables, verb, color }) => {
  const tableNames = Object.values(tables).map(t => t.name);
  return (
    <span>
      {verb}
      <Tooltip
        tooltip={
          <div className="p1">{tableNames.map(name => <div>{name}</div>)}</div>
        }
      >
        <span>
          <span className={color}>
            {" " +
              (n => ngettext(msgid`${n} table`, `${n} tables`, n))(
                tableNames.length,
              )}
          </span>
        </span>
      </Tooltip>
    </span>
  );
};

const PermissionsConfirm = ({ diff }) => (
  <div>
    {Object.values(diff.groups).map(group =>
      Object.values(group.databases).map(database => (
        <div>
          {(database.grantedTables || database.revokedTables) && (
            <div>
              <GroupName group={group} />
              {t` will be `}
              {database.grantedTables && (
                <TableAccessChange
                  verb={t`given access to`}
                  color="text-success"
                  tables={database.grantedTables}
                />
              )}
              {database.grantedTables && database.revokedTables && t` and `}
              {database.revokedTables && (
                <TableAccessChange
                  verb={t`denied access to`}
                  color="text-error"
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
              <GroupName group={group} />
              {database.native === "none"
                ? t` will no longer be able to `
                : t` will now be able to `}
              {database.native === "read" ? (
                <span className="text-gold">read</span>
              ) : database.native === "write" ? (
                <span className="text-success">write</span>
              ) : (
                <span>read or write</span>
              )}
              {t` native queries for `}
              <DatabaseName database={database} />
              {"."}
            </div>
          )}
        </div>
      )),
    )}
  </div>
);

export default PermissionsConfirm;
