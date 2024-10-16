import { t } from "ttag";
import { useEffect, useState } from "react";
import NoResults from "assets/img/no_results.svg";
import { useListDatabasesWithTablesQuery } from "metabase/api";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import { color } from "metabase/lib/colors";
import * as Urls from "metabase/lib/urls";
import { Box, Icon, Title, Tabs, Button } from "metabase/ui";
import {
  BrowseContainer,
  BrowseMain,
  BrowseSection,
  CenteredEmptyState,
} from "./BrowseContainer.styled";
import { DatabaseCard, DatabaseCardLink, DatabaseGrid } from "./BrowseDatabases.styled";
import { BrowseSemanticHeader } from "./BrowseSemanticHeader";
import { BrowseSemanticLayerTable } from "./BrowseSemanticLayerTable";

export const BrowseSemanticLayers = () => {
  const [showTable, setShowTable] = useState(false);

  const { data, isLoading, error } = useListDatabasesWithTablesQuery();
  const databases = data?.data;

  useEffect(() => {
    const filteredDatabases = databases?.filter(database => database.is_cube === true);

    if (filteredDatabases?.length === 1) {
      // Navigate directly to the component if only one database exists
      window.history.pushState({}, '', Urls.browseSemanticLayer(filteredDatabases[0]));
      setShowTable(true);
    }
  }, [databases]);

  if (error) {
    return <LoadingAndErrorWrapper error />;
  }

  if (!databases && isLoading) {
    return <LoadingAndErrorWrapper loading />;
  }

  const filteredDatabases = databases?.filter(database => database.is_cube === true);

  if (!filteredDatabases?.length) {
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
      <BrowseSemanticHeader />
      <BrowseMain>
        <BrowseSection>
        {showTable ? (
                <BrowseSemanticLayerTable />
              ) : (
                <DatabaseGrid data-testid="database-browser">
                  {filteredDatabases.map(database => (
                    <div key={database.id}>
                      <DatabaseCardLink to={Urls.browseSemanticLayer(database)}>
                        <DatabaseCard>
                          <Icon
                            name="semantic_layer"
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
              )}
        </BrowseSection>
      </BrowseMain>
    </BrowseContainer>
  );
};
