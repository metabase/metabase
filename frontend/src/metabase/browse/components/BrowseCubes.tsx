import { t } from "ttag";
import { useEffect, useMemo, useState } from "react";

import NoResults from "assets/img/no_results.svg";
import {
  useGetCubeDataQuery,
  useUpdateCubeDataMutation,
  useSyncDatabaseSchemaMutation,
  useListDatabasesQuery,
  skipToken,
} from "metabase/api";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { Button, Box } from "metabase/ui";

import {
  BrowseContainer,
  BrowseMain,
  BrowseSection,
  CenteredEmptyState,
} from "./BrowseContainer.styled";
import { CubeTable } from "./CubeTable";
import { SingleCube } from "./CubeSql";
import {
  addCubeWrapper,
  extractCubeName,
  extractCubeNames,
  removeLineBreaks,
  separateCubes,
} from "metabase/components/Cube/utils";
import { CubeHeader } from "./CubeHeader";
import { BrowseHeaderContent } from "./BrowseHeader.styled";
import { CubeDataItem, GetCubeDataRequest } from "metabase-types/api";
import { CubePreviewTable } from "metabase/components/Cube/CubePreviewTable";

export const BrowseCubes = () => {
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
  } = useGetCubeDataQuery(companyName ? { companyName } : skipToken);
  const [updateCubeData] = useUpdateCubeDataMutation();
  const [syncSChema] = useSyncDatabaseSchemaMutation();
  const [dbId, setDbId] = useState<number | null>(null);
  const [isCubeFlowOpen, setIsCubeFlowOpen] = useState<boolean>(false);
  const [selectedCube, setSelectedCube] = useState<CubeDataItem | null>(null);
  const [isSql, setIsSql] = useState<boolean>(false);
  const [title, setTitle] = useState<string>("");
  const [activeTab, setActiveTab] = useState("Definition");

  useEffect(() => {
    if (cubeData) {
      setCubeFromUrl(cubeData);
    }
  }, [cubeData]);

  const handleSemanticView = () => {
    setIsSql(!isSql);
  };

  const setCubeFromUrl = (cubes: any) => {
    const cubeName = window.location.pathname.split("/").pop();

    if (!cubeName) return;

    const matchedCube = cubes.find((cube: any) => {
      const fileName = cube.fileName.replace(".js", "");
      return fileName.toLowerCase() === cubeName.toLowerCase();
    });

    if (matchedCube) {
      setSelectedCube(matchedCube);
      const extractDetails = extractCubeName(matchedCube.content as string);
      setTitle(extractDetails);
      const dbId = setDbFromUrl();
      if (dbId !== undefined) {
        setDbId(dbId);
      }
    } else {
      console.warn(`No cube found matching the name: ${cubeName}`);
      setSelectedCube(null);
    }
  };

  const setDbFromUrl = () => {
    const pathSegments = window.location.pathname.split("/");
    const cubesIndex = pathSegments.indexOf("cubes");
    if (cubesIndex === -1 || cubesIndex === 0) return;

    const slug = pathSegments[cubesIndex - 1];

    if (!slug) return;
    const indexOfDash = slug.indexOf("-");
    if (indexOfDash === -1) {
      return 0;
    }
    return Number(slug.substring(0, indexOfDash));
  };

  const updateCube = async (updatedCubes: any) => {
    try {
      const extractedCubeNames = extractCubeNames(updatedCubes);
      const extractedCubeContent = separateCubes(updatedCubes);

      const cubeFiles: Record<string, string> = {};

      for (let i = 0; i < extractedCubeNames.length; i++) {
        const cubeName = extractedCubeNames[i];
        const cubeContent = extractedCubeContent[i];

        const fileName = `${cubeName.toLowerCase()}.js`;
        cubeFiles[fileName] = cubeContent;
      }

      const payload = {
        cubeFiles: {
          model: {
            cubes: cubeFiles,
          },
        },
      };

      if (companyName !== undefined) {
        await updateCubeData({
          payload,
          companyName,
        });

        await syncDbSchema();
      } else {
        console.warn("companyName not found", companyName);
      }
    } catch (error) {
      throw error;
    }
  };

  const syncDbSchema = async () => {
    if (dbId !== null) {
      await syncSChema(dbId);
    }
  };

  const handleCubeUpdate = (updatedCube: any, originalCube: any) => {
    if (selectedCube !== null) {
      const newCubeData = removeLineBreaks(updatedCube);
      const cubeName = extractCubeName(originalCube);
      const wrapperData = addCubeWrapper(newCubeData, cubeName);
      const wrapperDataWoLineBreak = addCubeWrapper(updatedCube, cubeName);
      updateCube(wrapperDataWoLineBreak);
      let modifiedCube = {
        fileName: selectedCube.fileName,
        content: wrapperDataWoLineBreak,
      };
      setSelectedCube(modifiedCube);
    }
  };

  const tabStyle = {
    padding: "10px 20px",
    cursor: "pointer",
    borderBottom: "2px solid transparent",
  };

  const activeTabStyle = {
    ...tabStyle,
    borderBottom: "2px solid #587330",
  };

  if (error) {
    return <LoadingAndErrorWrapper error />;
  }

  if (!cubeData && isLoading) {
    return <LoadingAndErrorWrapper loading />;
  }

  if (!cubeData?.length) {
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
      {selectedCube !== null && <CubeHeader cube={selectedCube} />}
      <BrowseMain>
        <BrowseSection>
          <div>
            {cubeData && !isCubeFlowOpen && selectedCube === null ? (
              <>
                <div style={{ display: "flex", flexDirection: "row" }}></div>
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "row" }}>
                {selectedCube !== null && (
                  <>
                    {isSql ? (
                      <SingleCube
                        cube={selectedCube}
                        isExpanded={true}
                        onUpdate={(updatedCube: any, originalCube: any) =>
                          handleCubeUpdate(updatedCube, originalCube)
                        }
                      />
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <BrowseHeaderContent></BrowseHeaderContent>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "row",
                            gap: "20px",
                            marginBottom: "10px",
                          }}
                        >
                          <div
                            style={
                              activeTab === "Definition"
                                ? activeTabStyle
                                : tabStyle
                            }
                            onClick={() => setActiveTab("Definition")}
                          >
                            Definition
                          </div>
                          <div
                            style={
                              activeTab === "Preview"
                                ? activeTabStyle
                                : tabStyle
                            }
                            onClick={() => setActiveTab("Preview")}
                          >
                            Preview
                          </div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "row" }}>
                          {activeTab === "Definition" && (
                            <>
                              <CubeTable cubeData={selectedCube} />
                              <Button
                                style={{
                                  width: "150px",
                                  height: "50px",
                                  marginLeft: "30px",
                                  background: "rgba(80, 158, 227, 0.2)",
                                  color: "#587330",
                                }}
                                onClick={handleSemanticView}
                              >
                                {isSql ? t`Go back` : t`Edit Cube`}
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                    {isSql && (
                      <Button
                        style={{
                          width: "150px",
                          height: "50px",
                          marginLeft: "30px",
                          background: "rgba(80, 158, 227, 0.2)",
                          color: "#587330",
                        }}
                        onClick={handleSemanticView}
                      >
                        {t`Go back`}
                      </Button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </BrowseSection>
        {cubeData && selectedCube && activeTab === "Preview" && dbId && (
          <CubePreviewTable dbId={dbId} cubeData={selectedCube} />
        )}
      </BrowseMain>
    </BrowseContainer>
  );
};
