import { t } from "ttag";
import { useEffect, useMemo, useState } from "react";

import NoResults from "assets/img/no_results.svg";
import {
  skipToken,
  useGetCubeDataQuery,
  useListDatabasesQuery,
} from "metabase/api";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { Button, Box } from "metabase/ui";
import * as Urls from "metabase/lib/urls";

import {
  BrowseContainer,
  BrowseMain,
  BrowseSection,
  CenteredEmptyState,
} from "./BrowseContainer.styled";
import { BrowseSemanticHeader } from "./BrowseSemanticHeader";
import { SemanticTable } from "./SemanticTable";
import { MaybeItemLinkDataMap } from "metabase/components/ItemsTable/BaseItemsTable.styled";
import { GetCubeDataRequest } from "metabase-types/api";

export const BrowseSemanticLayerTable = () => {
  const {
    data: dbData,
    isLoading: dbLoading,
    error: dbError,
  } = useListDatabasesQuery();
  const databases = dbData?.data;
  const companyName = useMemo(() => {
    if (databases) {
      const cubeDatabase = databases.find(
        database => database.is_cube === true,
      );
      return cubeDatabase ? cubeDatabase.company_name : "";
    }
    return "";
  }, [databases]);

  const {
    data: cubeData,
    isLoading,
    error,
  } = useGetCubeDataQuery(companyName ? { projectName: companyName } : skipToken);

  const [selectedCube, setSelectedCube] = useState(null);

  const handleRowClick = (cube: any) => {
    setSelectedCube(cube);
  };

  if (error) {
    return <LoadingAndErrorWrapper error />;
  }

  if (!cubeData && isLoading) {
    return <LoadingAndErrorWrapper loading />;
  }

  if (!cubeData?.cubes.length) {
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
   
      <BrowseMain>
        <BrowseSection>
          <div>
            {cubeData && (
              <>
                <div style={{ display: "flex", flexDirection: "row" }}>
                  <SemanticTable
                    cubeDataArray={cubeData.cubes}
                    onRowClick={handleRowClick}
                  />
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 2 }}
                  >
                    <MaybeItemLinkDataMap to={Urls.browseCubeFlow()}>
                      <Button
                        style={{
                          width: "150px",
                          height: "40px",
                          marginLeft: "30px",
                          background: "rgba(80, 158, 227, 0.2)",
                          color: "#587330",
                        }}
                      >
                        {t`Data Map`}
                      </Button>
                    </MaybeItemLinkDataMap>
                  </div>
                </div>
              </>
            )}
          </div>
        </BrowseSection>
      </BrowseMain>
    </BrowseContainer>
  );
};
