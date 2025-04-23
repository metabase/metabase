import cx from "classnames";
import { useMemo } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import { FormMessage } from "metabase/forms";
import { isSyncCompleted } from "metabase/lib/syncing";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { Button, Flex, Loader, UnstyledButton } from "metabase/ui";
import type { Database, Engine } from "metabase-types/api";

const query = {
  ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.databaseDetailsQueryProps,
};

interface DatabaseListProps {
  databases: Database[];
  engines: Record<string, Engine>;
  deletes: Array<any>;
  deletionError: any;
  isAdmin: boolean;
  isAddingSampleDatabase: boolean;
  addSampleDatabase: (query: any) => void;
  addSampleDatabaseError: boolean;
  children?: React.ReactNode;
}

export const DatabaseList = ({
  children,
  databases,
  addSampleDatabase,
  isAddingSampleDatabase,
  addSampleDatabaseError,
  engines,
  deletes,
  deletionError,
  isAdmin,
}: DatabaseListProps) => {
  const error = deletionError || addSampleDatabaseError;

  const hasSampleDatabase = useMemo(() => {
    return databases.some((db) => db.is_sample);
  }, [databases]);

  return (
    <>
      <div className={CS.wrapper} data-testid="database-list">
        <section className={cx(AdminS.PageHeader, CS.px2, CS.clearfix)}>
          <Flex justify="space-between" align="center">
            <h2 className={CS.m0}>{t`Databases`}</h2>
            {isAdmin && (
              <Button
                variant="filled"
                component={Link}
                to="/admin/databases/create"
              >{t`Add database`}</Button>
            )}
          </Flex>
        </section>
        {error && (
          <section>
            <FormMessage formError={error} />
          </section>
        )}
        <section>
          <table className={AdminS.ContentTable}>
            <thead>
              <tr>
                <th>{t`Name`}</th>
                <th>{t`Engine`}</th>
              </tr>
            </thead>
            <tbody>
              {databases ? (
                databases.map((database) => (
                  <tr
                    key={database.id}
                    className={cx({
                      disabled: deletes.indexOf(database.id) !== -1,
                    })}
                  >
                    <td>
                      <Flex align="center">
                        {!isSyncCompleted(database) && (
                          <Loader size="xs" mr="sm" />
                        )}
                        <Link
                          to={"/admin/databases/" + database.id}
                          className={cx(CS.textBold, CS.link)}
                        >
                          {database.name}
                        </Link>
                      </Flex>
                    </td>
                    <td>
                      {engines?.[database.engine ?? ""]?.["driver-name"] ??
                        database.engine}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4}>
                    <Loader size="1rem" />
                    <h3>{t`Loading ...`}</h3>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {!hasSampleDatabase && isAdmin ? (
            <div className={CS.pt4}>
              <span
                className={cx(CS.p2, CS.textItalic, {
                  [CS.borderTop]: databases && databases.length > 0,
                })}
              >
                {isAddingSampleDatabase ? (
                  <span className={cx(CS.textLight, CS.noDecoration)}>
                    {t`Restoring the sample database...`}
                  </span>
                ) : (
                  <UnstyledButton
                    c="brand"
                    onClick={() => addSampleDatabase(query)}
                  >
                    {t`Bring the sample database back`}
                  </UnstyledButton>
                )}
              </span>
            </div>
          ) : null}
        </section>
      </div>

      {children}
    </>
  );
};
