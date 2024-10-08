import { t } from "ttag";
import { useEffect, useState, useLayoutEffect, useRef, useMemo } from "react";
import NoResults from "assets/img/no_results.svg";
import { useListDatabasesWithTablesQuery, useDeployCubeDataMutation } from "metabase/api"; // Import the deploy mutation
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import { color } from "metabase/lib/colors";
import * as Urls from "metabase/lib/urls";
import { Box, Icon, Title, Tabs, Button } from "metabase/ui"; // Import Button component
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
  const [insertedData, setInsertedData] = useState<any[]>([
    {
      projectName: "Sample Project 1",
      dockerfile: "/Dockerfile",
      dockerContextPath: "/",
      customGitUrl: "https://github.com/sample/repo1.git",
      customGitBranch: "main",
      customGitBuildPath: "/build",
      apiUrl: "https://api.sample1.com",
      token: "token1",
      apiPort: 4000,
    },
    {
      projectName: "Sample Project 2",
      dockerfile: "/Dockerfile",
      dockerContextPath: "/context",
      customGitUrl: "https://github.com/sample/repo2.git",
      customGitBranch: "develop",
      customGitBuildPath: "/dist",
      apiUrl: "https://api.sample2.com",
      token: "token2",
      apiPort: 5000,
    },
  ]); // State to hold the inserted data
  const [activeTab, setActiveTab] = useState<string>("DatabaseGrid");
  const tabsRef = useRef<HTMLDivElement>(null);
  const [tabsHeight, setTabsHeight] = useState<number>(300);

  const { data, isLoading, error } = useListDatabasesWithTablesQuery();
  const databases = data?.data;

  const companyName = useMemo(() => {
    if (databases) {
      const cubeDatabase = databases.find(
        database => database.is_cube === true,
      );
      return cubeDatabase ? cubeDatabase.company_name : "";
    }
    return "";
  }, [databases]);

  // Hook for deploy API mutation
  const [deployCubeData] = useDeployCubeDataMutation();

  // Handle receiving data from BrowseSemanticHeader
  const handleSaveData = (newData: any) => {
    setInsertedData(prevData => [...prevData, newData]);
  };

  useEffect(() => {
    const filteredDatabases = databases?.filter(database => database.is_cube === true);

    if (filteredDatabases?.length === 1) {
      // Navigate directly to the component if only one database exists
      window.history.pushState({}, '', Urls.browseSemanticLayer(filteredDatabases[0]));
      setShowTable(true);
    }
  }, [databases]);

  // Adjust the tab container height dynamically
  useLayoutEffect(() => {
    const handleResize = () => {
      const tabs = tabsRef?.current;
      if (!tabs) {
        return;
      }
      const tabsElementTop = tabs.getBoundingClientRect().top;
      const newHeight = window.innerHeight - tabsElementTop - tabs.clientTop;
      setTabsHeight(newHeight);
    };
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [tabsRef]);

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

  // Function to handle deploy button click
  const handleDeploy = async (companyName: string) => {
    console.log({companyName})
    try {
      await deployCubeData({ companyName }).unwrap(); // Call deploy mutation with projectName
      console.log(`Deployment initiated for ${companyName}`);
    } catch (error) {
      console.error(`Failed to deploy project: ${companyName}`, error);
    }
  };

  // Table rendering function for inserted data with Deploy button and ellipsis for customGitUrl
  const renderDataTable = () => (
    <div style={{ overflowX: "auto", width: "100%" }}> {/* Make table responsive */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "20px", minWidth: "600px" }}>
        <thead>
          <tr>
            {Object.keys(insertedData[0]).map((key: any) => (
              <th key={key} style={{ border: "1px solid #ddd", padding: "8px" }}>{t(key)}</th>
            ))}
            <th style={{ border: "1px solid #ddd", padding: "8px" }}>{t`Actions`}</th> {/* Actions column */}
          </tr>
        </thead>
        <tbody>
          {insertedData.map((data, index) => (
            <tr key={index}>
              {Object.entries(data).map(([key, value], i) => (
                <td
                key={i}
                style={{
                  border: "1px solid #ddd",
                  padding: "8px",
                  wordWrap: "break-word",
                  ...(key === "customGitUrl"
                    ? {
                        maxWidth: "120px",  /* Limit the width */
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis"
                      }
                    : {}),
                }}
                title={key === "customGitUrl" ? String(value) : undefined} // Ensure value is cast to string for title
              >
                {String(value)} {/* Cast value to string for rendering */}
              </td>
              
              ))}
              <td style={{ border: "1px solid #ddd", padding: "8px", textAlign: "center" }}>
                <Button
                  variant="filled"
                  style={{ backgroundColor: "#223800", color: "#fff" }}
                  onClick={() => handleDeploy(data.projectName)} // Call handleDeploy with projectName
                >
                  {t`Deploy`}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // Define tabs
  const tabs = [
    {
      name: t`Databases`,
      key: "DatabaseGrid",
      isActive: activeTab === "DatabaseGrid",
      to: "",
    },
    {
      name: t`Inserted Data`,
      key: "InsertedData",
      isActive: activeTab === "InsertedData",
      to: "",
    },
  ];

  return (
    <BrowseContainer>
      {/* Pass the handleSaveData to the BrowseSemanticHeader */}
      <BrowseSemanticHeader onSaveData={handleSaveData} />
      <BrowseMain>
        <BrowseSection>
          <Tabs value={activeTab} style={{ width: "100%" }}>
            <Tabs.List mx="1rem" mb="1rem">
              {tabs.map(tab => (
                <Tabs.Tab
                  key={tab.key}
                  value={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.name}
                </Tabs.Tab>
              ))}
            </Tabs.List>

            {/* Render the panels based on the active tab */}
            <Tabs.Panel value="DatabaseGrid">
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
            </Tabs.Panel>

            {insertedData.length > 0 && (
              <Tabs.Panel value="InsertedData">
                {renderDataTable()}
              </Tabs.Panel>
            )}
          </Tabs>
        </BrowseSection>
      </BrowseMain>
    </BrowseContainer>
  );
};
