import _ from "underscore";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { color } from "metabase/lib/colors";

import { Icon, Box } from "metabase/ui";
import Link from "metabase/core/components/Link";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import type { useDatabaseListQuery } from "metabase/common/hooks";

import NoResults from "assets/img/no_results.svg";
import {
  DatabaseCard,
  DatabaseGrid,
  DatabaseGridItem,
} from "./BrowseDatabases.styled";
import { CenteredEmptyState } from "./BrowseApp.styled";

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
              <h3 className="text-wrap">{database.name}</h3>
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
