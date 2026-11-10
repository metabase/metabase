/* eslint-disable @typescript-eslint/no-unsafe-assignment -- FIXME: any-typed values */
import cx from "classnames";
import { useMemo } from "react";
import { t } from "ttag";

import { BrowseCard } from "metabase/common/components/BrowseCard";
import { BrowseGrid } from "metabase/common/components/BrowseGrid";
import { Link } from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import { getEngineLogo } from "metabase/databases/utils/engine";
import { FormMessage } from "metabase/forms";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import {
  Badge,
  Box,
  Button,
  FixedSizeIcon,
  Flex,
  Group,
  Loader,
  Title,
  UnstyledButton,
} from "metabase/ui";
import { isSyncCompleted } from "metabase/utils/syncing";
import type { Database, Engine } from "metabase-types/api";

import { DatabaseEngineAndAddedDate } from "../DatabaseEngineAndAddedDate";

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
      <div data-testid="database-list">
        <Flex justify="space-between" align="center" mb="lg">
          <Title order={1}>{t`Databases`}</Title>
          {isAdmin && (
            <Button
              variant="filled"
              component={Link}
              to="/admin/databases/create"
            >{t`Add database`}</Button>
          )}
        </Flex>
        {error && (
          <section>
            <FormMessage formError={error} />
          </section>
        )}
        <section>
          {databases ? (
            <BrowseGrid cols={{ "10rem": 1, "20rem": 2 }}>
              {databases.map((database) => (
                <BrowseCard
                  key={database.id}
                  to={`/admin/databases/${database.id}`}
                  title={database.name}
                  size="lg"
                  description={
                    <DatabaseEngineAndAddedDate database={database} />
                  }
                  icon={<EngineLogo database={database} engines={engines} />}
                  className={cx({
                    [CS.disabled]: deletes.indexOf(database.id) !== -1,
                  })}
                >
                  <Group gap="sm" wrap="nowrap">
                    {database.is_stub && (
                      <Badge variant="light" color="neutral">
                        {t`Stubbed`}
                      </Badge>
                    )}
                    {!isSyncCompleted(database) && <Loader size="xs" />}
                  </Group>
                </BrowseCard>
              ))}
            </BrowseGrid>
          ) : (
            <Flex justify="center" py="xl">
              <Loader />
            </Flex>
          )}
          {!hasSampleDatabase && isAdmin ? (
            <div className={CS.pt4}>
              <span
                className={cx(CS.p2, CS.textItalic, {
                  [CS.borderTop]: databases && databases.length > 0,
                })}
              >
                {isAddingSampleDatabase ? (
                  <span className={cx(CS.textSecondary, CS.noDecoration)}>
                    {t`Restoring the sample database...`}
                  </span>
                ) : (
                  <UnstyledButton
                    c="core-brand"
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

const ENGINE_LOGO_SIZE = 32;

const EngineLogo = ({
  database,
  engines,
}: {
  database: Pick<Database, "engine" | "is_stub">;
  engines: Record<string, Engine>;
}) => {
  const { engine, is_stub } = database;
  const logo = engine && !is_stub ? getEngineLogo(engine) : undefined;
  const engineName = is_stub
    ? t`Unknown`
    : (engines?.[engine ?? ""]?.["driver-name"] ?? engine ?? t`Unknown`);

  return logo ? (
    <Box
      component="img"
      src={logo}
      alt={engineName}
      title={engineName}
      w={ENGINE_LOGO_SIZE}
      h={ENGINE_LOGO_SIZE}
      style={{ flexShrink: 0 }}
    />
  ) : (
    <FixedSizeIcon
      name="database"
      c="core-brand"
      size={ENGINE_LOGO_SIZE}
      aria-label={engineName}
    />
  );
};
