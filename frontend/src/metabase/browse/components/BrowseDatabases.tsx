import { t } from "ttag";

import NoResults from "assets/img/no_results.svg";
import type { useDatabaseListQuery } from "metabase/common/hooks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import { color } from "metabase/lib/colors";
import * as Urls from "metabase/lib/urls";
import { Box, Icon, Title } from "metabase/ui";

import { CenteredEmptyState } from "./BrowseApp.styled";
import {
  DatabaseCard,
  DatabaseCardLink,
  DatabaseGrid,
} from "./BrowseDatabases.styled";

export const BrowseDatabases = ({
  databasesResult,
}: {
  databasesResult: ReturnType<typeof useDatabaseListQuery>;
}) => {
  const { data: databases, error, isLoading } = databasesResult;

  if (error) {
    return <LoadingAndErrorWrapper error />;
  }

  if (!databases && isLoading) {
    return <LoadingAndErrorWrapper loading />;
  }

  return databases?.length ? (
    <DatabaseGrid data-testid="database-browser">
      {databases.map(database => (
        <div key={database.id}>
          <DatabaseCardLink to={Urls.browseDatabase(database)}>
            <DatabaseCard>
              <Icon
                name="database"
                color={color("accent2")}
                className={CS.mb3}
                size={32}
              />
              <Title order={2} size="1rem" lh="1rem" color="inherit">
                {database.name}
              </Title>
            </DatabaseCard>
          </DatabaseCardLink>
        </div>
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
