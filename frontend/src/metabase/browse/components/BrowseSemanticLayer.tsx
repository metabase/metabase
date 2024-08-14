import { t } from "ttag";
import { useState } from "react";

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
import { BrowseSemanticHeader } from "./BrowseSemanticHeader";
import { SemanticTable } from "./SemanticTable";
import CubeFlow from "metabase/components/Cube/CubeFlow";
import { CubeTable } from "./CubeTable";
import { SingleCube } from "./CubeSql";
import { addCubeWrapper, extractCubeName, extractCubeNames, removeLineBreaks, separateCubes } from "metabase/components/Cube/utils";
import { CubeHeader } from "./CubeHeader";


export const BrowseSemanticLayer = () => {
  const { data: cubeData, isLoading, error } = useGetCubeDataQuery();
  const [updateCubeData] = useUpdateCubeDataMutation();
  const [isCubeFlowOpen, setIsCubeFlowOpen] = useState<boolean>(false);
  const [selectedCube, setSelectedCube] = useState(null);
  const [isSql, setIsSql] = useState<boolean>(false)

  const handleCubeFlow = () => {
    setIsCubeFlowOpen(!isCubeFlowOpen)
  }

  const handleSemanticView = () => {
    setIsSql(!isSql)
  }

  const handleRowClick = (cube:any) => {
    setSelectedCube(cube);
  };

  const updateCube = async (updatedCubes: any) => {
    try {
      // const company_name = await getCubeCompanyName();
      const company_name = "omni_test"
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
        company_name,
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
    {selectedCube !== null ? (
      <CubeHeader cube={selectedCube}/>
    ) : (
      <BrowseSemanticHeader />
    )}
      <BrowseMain>
        <BrowseSection>
        <div>

        {cubeData && !isCubeFlowOpen && selectedCube === null ? ( 
          < SemanticTable cubeDataArray={cubeData} onRowClick={handleRowClick}/>
        ): (
          <div style={{display:"flex", flexDirection: "row" }}>
          { selectedCube !== null && (
            <>
            {isSql ? (
              <SingleCube
              cube={selectedCube}
              isExpanded={true}
              onUpdate={(updatedCube: any, originalCube: any) => handleCubeUpdate(updatedCube, originalCube)}
              />
            ) : (
              <CubeTable cubeData={selectedCube}/>
            )}
          <Button style={{width: "150px", height:"50px", marginLeft:"30px", background:"rgba(80, 158, 227, 0.2)", color:"#509EE3"}} onClick={handleSemanticView}>{isSql ? t`Go back` : t`Edit Cube`}</Button>
          </>
          )}

          </div>
        )}
      </div>
        </BrowseSection>
      </BrowseMain>
      {cubeData && isCubeFlowOpen && ( 
        <CubeFlow cubes={cubeData as { content: string }[]} />
      )}
      {cubeData && !isCubeFlowOpen && selectedCube === null && (  <Button style={{width: "200px", background:"rgba(80, 158, 227, 0.2)", color:"#509EE3", position: "absolute", bottom: "-380px", left: "40px"}} onClick={handleCubeFlow}>{t`Data Map`}</Button> )}
    </BrowseContainer>
  );
};
