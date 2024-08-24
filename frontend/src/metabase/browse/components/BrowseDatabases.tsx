import { t } from "ttag";

import NoResults from "assets/img/no_results.svg";
import { useListDatabasesQuery } from "metabase/api";
import Loading from "metabase/components/Loading";
import CS from "metabase/css/core/index.css";
import { color } from "metabase/lib/colors";
import * as Urls from "metabase/lib/urls";
import { Box, Icon, Title } from "metabase/ui";

import {
  BrowseContainer,
  BrowseMain,
  BrowseSection,
  CenteredEmptyState,
} from "./BrowseContainer.styled";
import { BrowseDataHeader } from "./BrowseDataHeader";
import {
  DatabaseCard,
  DatabaseCardLink,
  DatabaseGrid,
} from "./BrowseDatabases.styled";

export const BrowseDatabases = () => {
  const { data, isLoading, error } = useListDatabasesQuery();
  const databases = data?.data;

  if (error) {
    return <Loading error />;
  }

  if (!databases && isLoading) {
    return <Loading loading />;
  }

  if (!databases?.length) {
    return (
      <CenteredEmptyState
        title={<Box mb=".5rem">{t`No databases here yet`}</Box>}
        illustrationElement={
          <Box mb=".5rem">
            <img src={NoResults} />
          </Box>
        }
      />
    );
  }

  return (
    <BrowseContainer>
      <BrowseDataHeader />
      <BrowseMain>
        <BrowseSection>
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
        </BrowseSection>
      </BrowseMain>
    </BrowseContainer>
  );
};
