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
import { Button, Box, Input } from "metabase/ui"; // Import Input component
import { getUser } from "metabase/selectors/user";
import {
  BrowseContainer,
  BrowseMain,
  BrowseSection,
  CenteredEmptyState,
} from "./BrowseContainer.styled";
import { CubeResult, CubeTable } from "./CubeTable";
import { SingleCube } from "./CubeSql";
import {
  addCubeWrapper,
  extractCubeName,
  extractCubeNames,
  formatAndCleanCubeContent,
  removeLineBreaks,
  separateCubes,
} from "metabase/components/Cube/utils";
import { CubeHeader } from "./CubeHeader";
import { BrowseHeaderContent } from "./BrowseHeader.styled";
import { CubeDataItem, GetCubeDataRequest } from "metabase-types/api";
import { CubePreviewTable } from "metabase/components/Cube/CubePreviewTable";
import { useSelector } from "react-redux";
import {
  useListCubesRequestDetailsQuery,
  useUpdateCubesRequestDetailsMutation,
} from "metabase/api/cubes_requests";

export const BrowseCubes = () => {
  const {
    data: dbData,
    isLoading: dbLoading,
    error: dbError,
  } = useListDatabasesQuery();

  const [updateCubesRequestDetails] = useUpdateCubesRequestDetailsMutation(); // Initialize the mutation hook

  const user = useSelector(getUser);

  // Hook to fetch cube requests
  const {
    data: cubeRequestsData,
    isLoading: isLoadingRequests,
    error: errorRequests,
    refetch: refetchCubeRequests, // Add refetch to trigger fetch again
  } = useListCubesRequestDetailsQuery(); // Use the hook directly

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
  const [showValidations, setShowValidations] = useState<boolean>(false);

  // State for filter inputs
  const [descriptionFilter, setDescriptionFilter] = useState<string>(""); // New filter state
  const [userFilter, setUserFilter] = useState<string>("");
  const [verified_statusFilter, setverified_statusFilter] =
    useState<string>(""); // New filter state
  const [selectTeamFilter, setSelectTeamFilter] = useState<string>("");

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
      const wrapperDataWoLineBreak = addCubeWrapper(newCubeData, cubeName);
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

  const handleUpdateverified_status = async (updatedCube: CubeResult) => {
    if (!selectedCube || !cubeRequestsData) return;
    const cubesDataArray = cubeRequestsData;

    const matchingCubeRequest = cubesDataArray.find(
      (cubeRequest: any) => cubeRequest.description === updatedCube.description,
    );

    if (!matchingCubeRequest) {
      console.warn("No matching cube request found to update.");
      return;
    }

    const admin_user = user?.common_name;
    if (!admin_user || admin_user.trim() === "") {
      console.error("Admin User is invalid or empty:", admin_user);
      return;
    }

    const updatedDetails = {
      id: matchingCubeRequest.id,
      verified_status: true,
      admin_user: admin_user,
      user: matchingCubeRequest.user,
      description: matchingCubeRequest.description,
      in_semantic_layer: matchingCubeRequest.in_semantic_layer,
    };

    try {
      await updateCubesRequestDetails(updatedDetails).unwrap();
      refetchCubeRequests(); // Refetch data after update
    } catch (error) {
      console.error("Failed to update cube request details:", error);
    }
  };

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
                        handleSemanticView={handleSemanticView}
                      />
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <BrowseHeaderContent />
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "row",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: "20px",
                            marginBottom: "10px",
                          }}
                        >
                          {/* Conditionally render filters or tabs based on showValidations */}
                          {showValidations ? (
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "row",
                                width: "100%",
                                gap: "10px",
                              }}
                            >
                              <Input
                                placeholder={t`Description`} // Description Filter
                                value={descriptionFilter}
                                onChange={e =>
                                  setDescriptionFilter(e.target.value)
                                }
                              />
                              <Input
                                placeholder={t`User`}
                                value={userFilter}
                                onChange={e => setUserFilter(e.target.value)}
                              />
                              <Input
                                placeholder={t`Verified Status`} // Verified Status Filter
                                value={verified_statusFilter}
                                onChange={e =>
                                  setverified_statusFilter(e.target.value)
                                }
                              />
                              <Input
                                placeholder={t`Select Team`}
                                value={selectTeamFilter}
                                onChange={e =>
                                  setSelectTeamFilter(e.target.value)
                                }
                              />
                            </div>
                          ) : (
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "row",
                                width: "100%",
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
                          )}
                          {/* Validations button remains on the right side */}
                          {cubeRequestsData && cubeRequestsData.length > 0 && (
                            <Button
                              style={{
                                width: "150px",
                                height: "40px",
                                marginLeft: "auto",
                                background: "#D5E3C3",
                                color: "#587330",
                                borderRadius: "8px",
                              }}
                              onClick={() =>
                                setShowValidations(!showValidations)
                              }
                            >
                              {showValidations
                                ? t`Definitions`
                                : t`Validations`}
                            </Button>
                          )}
                          {!showValidations && (
                            <Button
                              style={{
                                width: "150px",
                                height: "40px",
                                background: "#D5E3C3",
                                color: "#587330",
                                borderRadius: "8px",
                              }}
                              onClick={handleSemanticView}
                            >
                              {t`Edit Cube`}
                            </Button>
                          )}
                        </div>
                        <div style={{ display: "flex", flexDirection: "row" }}>
                          {activeTab === "Definition" &&
                            (showValidations ? (
                              <CubeTable
                                cubeData={selectedCube}
                                isValidation={true}
                                handleSemanticView={handleSemanticView}
                                onUpdateCube={handleUpdateverified_status}
                                questionFilter={descriptionFilter} // Pass descriptionFilter
                                isValidateFilter={verified_statusFilter} // Pass verified_statusFilter
                                userFilter={userFilter} // Pass userFilter
                                cubeRequests={cubeRequestsData} // Use fetched cube requests data
                              />
                            ) : (
                              <CubeTable
                                cubeData={selectedCube}
                                isValidation={false}
                                handleSemanticView={handleSemanticView}
                                onUpdateCube={handleUpdateverified_status}
                                questionFilter={descriptionFilter} // Pass descriptionFilter
                                isValidateFilter={verified_statusFilter} // Pass verified_statusFilter
                                userFilter={userFilter} // Pass userFilter
                                cubeRequests={cubeRequestsData} // Use fetched cube requests data
                              />
                            ))}
                        </div>
                      </div>
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
