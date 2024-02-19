import { t } from "ttag";

import { color } from "metabase/lib/colors";
import * as Urls from "metabase/lib/urls";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import Link from "metabase/core/components/Link";
import { Box, Icon, Title } from "metabase/ui";

import type { useDatabaseListQuery } from "metabase/common/hooks";

import NoResults from "assets/img/no_results.svg";
import { CenteredEmptyState } from "./BrowseApp.styled";
import {
  DatabaseCard,
  DatabaseGrid,
  DatabaseGridItem,
} from "./BrowseDatabases.styled";

export const BrowseDatabases = ({
  databasesResult,
}: {
  databasesResult: ReturnType<typeof useDatabaseListQuery>;
}) => {
  const { data: databases = [], error, isLoading } = databasesResult;

  if (error) {
    return <LoadingAndErrorWrapper error />;
  }

  if (isLoading) {
    return <LoadingAndErrorWrapper loading />;
  }

  return databases.length ? (
    <DatabaseGrid data-testid="database-browser">
      {databases.map(database => (
        <DatabaseGridItem key={database.id}>
          <Link to={Urls.browseDatabase(database)}>
            <DatabaseCard>
              <Icon
                name="database"
                color={color("accent2")}
                className="mb3"
                size={32}
              />
              <Title order={2} size="1rem" lh="1rem">
                {database.name}
              </Title>
            </DatabaseCard>
          </Link>
        </DatabaseGridItem>
      ))}
    </DatabaseGrid>
  ) : (
    <CenteredEmptyState
      title={<Box mb=".5rem">{t`No databases here yet`}</Box>}
      illustrationElement={
        <Box mb=".5rem">
          <img src={NoResults} />
        </Box>
      }
    />
  );
};
