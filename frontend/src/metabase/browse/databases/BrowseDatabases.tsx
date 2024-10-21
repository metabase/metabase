import { t } from "ttag";

import NoResults from "assets/img/no_results.svg";
import { useListDatabasesQuery } from "metabase/api";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import { color } from "metabase/lib/colors";
import * as Urls from "metabase/lib/urls";
import { Box, Icon, SimpleGrid, Title } from "metabase/ui";

import {
  BrowseContainer,
  BrowseMain,
  BrowseSection,
  CenteredEmptyState,
} from "../components/BrowseContainer.styled";
import { BrowseDataHeader } from "../components/BrowseDataHeader";

import { DatabaseCard, DatabaseCardLink } from "./BrowseDatabases.styled";

export const BrowseDatabases = () => {
  const { data, isLoading, error } = useListDatabasesQuery();
  const databases = data?.data;

  if (error) {
    return <LoadingAndErrorWrapper error />;
  }

  if (!databases && isLoading) {
    return <LoadingAndErrorWrapper loading />;
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
          <SimpleGrid
            data-testid="database-browser"
            cols={{ base: 1, md: 2, lg: 3 }}
            spacing="md"
            w="100%"
          >
            {databases.map(database => (
              <Box key={database.id}>
                <DatabaseCardLink to={Urls.browseDatabase(database)}>
                  <DatabaseCard>
                    <Icon
                      name="database"
                      color={color("accent2")}
                      className={CS.mb3}
                      size={32}
                    />
                    <Title order={2} size="1rem" lh="1rem" c="inherit">
                      {database.name}
                    </Title>
                  </DatabaseCard>
                </DatabaseCardLink>
              </Box>
            ))}
          </SimpleGrid>
        </BrowseSection>
      </BrowseMain>
    </BrowseContainer>
  );
};
