import { t } from "ttag";
import { useEffect, useState } from "react";

import NoResults from "assets/img/no_results.svg";
import { useGetCubeDataQuery, useUpdateCubeDataMutation } from "metabase/api";
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
import { addCubeWrapper, extractCubeName, extractCubeNames, removeLineBreaks, separateCubes } from "metabase/components/Cube/utils";
import { CubeHeader } from "./CubeHeader";
import { BrowseHeaderContent } from "./BrowseHeader.styled";
import { CubeDataItem } from "metabase-types/api";


export const BrowseCubes = () => {
  const { data: cubeData, isLoading, error } = useGetCubeDataQuery();
  const [updateCubeData] = useUpdateCubeDataMutation();
  const [isCubeFlowOpen, setIsCubeFlowOpen] = useState<boolean>(false);
  const [selectedCube, setSelectedCube] = useState<CubeDataItem | null>(null);
  const [isSql, setIsSql] = useState<boolean>(false)
  const [title, setTitle] = useState<string>("")
  useEffect(() => {
    if (cubeData) {
      setCubeFromUrl(cubeData);
    }
  }, [cubeData]);

  const handleSemanticView = () => {
    setIsSql(!isSql)
  }

  const setCubeFromUrl = (cubes:any) => {
    const cubeName = window.location.pathname.split('/').pop();
    
    if (!cubeName) return;
  
    const matchedCube = cubes.find((cube:any) => {
      const fileName = cube.fileName.replace('.js', '');
      return fileName.toLowerCase() === cubeName.toLowerCase();
    });
  
    if (matchedCube) {
      setSelectedCube(matchedCube);
      const extractDetails = extractCubeName(matchedCube.content as string)
      setTitle(extractDetails)
    } else {
      console.warn(`No cube found matching the name: ${cubeName}`);
      setSelectedCube(null);
    }
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
            cubes: cubeFiles
          }
        }
      };

      await updateCubeData({
        payload
      })

    } catch (error) {
      throw error;
    }
  }

  const handleCubeUpdate = (updatedCube: any, originalCube: any) => {
    if(selectedCube !== null) {
      const newCubeData = removeLineBreaks(updatedCube)
      const cubeName = extractCubeName(originalCube)
      const wrapperData = addCubeWrapper(newCubeData, cubeName)
      updateCube(wrapperData)
      let modifiedCube = {fileName:selectedCube.fileName, content:wrapperData}
      setSelectedCube(modifiedCube)
    }
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
    { selectedCube !== null && (
        <CubeHeader cube={selectedCube}/>
    )}
      <BrowseMain>
        <BrowseSection>
          <div>
            {cubeData && !isCubeFlowOpen && selectedCube === null ? ( 
              <>
              <div style={{ display:"flex", flexDirection: "row"}}>
              </div>
              </>
            ) : (
              <div style={{display: "flex", flexDirection: "row"}}>
                {selectedCube !== null && (
                  <>
                    {isSql ? (
                      <SingleCube
                        cube={selectedCube}
                        isExpanded={true}
                        onUpdate={(updatedCube: any, originalCube: any) => handleCubeUpdate(updatedCube, originalCube)}
                      />
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column"}}>
                      <BrowseHeaderContent>
              </BrowseHeaderContent>
              <div style={{ display: "flex", flexDirection: "row"}}>
                      <CubeTable cubeData={selectedCube}/>
                      <Button 
                      style={{
                        width: "150px", 
                        height: "50px", 
                        marginLeft: "30px", 
                        background: "rgba(80, 158, 227, 0.2)", 
                        color: "#509EE3"
                      }} 
                      onClick={handleSemanticView}
                    >
                      {isSql ? t`Go back` : t`Edit Cube`}
                    </Button>
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
                        color: "#509EE3"
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
      </BrowseMain>
    </BrowseContainer>
  );
};
