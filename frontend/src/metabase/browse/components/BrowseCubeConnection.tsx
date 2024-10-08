import { t } from "ttag";

import NoResults from "assets/img/no_results.svg";
import { useListDatabasesWithTablesQuery } from "metabase/api";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
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
import { BrowseSemanticHeader } from "./BrowseSemanticHeader";
import { BrowseSemanticLayerTable } from "./BrowseSemanticLayerTable";
import { useEffect, useState } from "react";

export const BrowseCubeConnection = () => {
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

  if (showTable) {
    return <BrowseSemanticLayerTable />;
  }

  return (
    <BrowseContainer>
      <BrowseSemanticHeader />
      <BrowseMain>
        <BrowseSection>
          TEST
        </BrowseSection>
      </BrowseMain>
    </BrowseContainer>
  );
};