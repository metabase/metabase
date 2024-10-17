import { t } from "ttag";
import { useState } from "react";

import NoResults from "assets/img/no_results.svg";
import {
  skipToken,
  useGetCubeDataQuery,
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
import { SemanticTable } from "./SemanticTable";
import { MaybeItemLinkDataMap } from "metabase/components/ItemsTable/BaseItemsTable.styled";

import { useSetting } from "metabase/common/hooks";

export const BrowseSemanticLayerTable = () => {
  const siteName = useSetting("site-name");
  const formattedSiteName = siteName
    ? siteName.replace(/\s+/g, "_").toLowerCase()
    : "";
  const {
    data: cubeData,
    isLoading,
    error,
  } = useGetCubeDataQuery(formattedSiteName ? { projectName: formattedSiteName } : skipToken);

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
