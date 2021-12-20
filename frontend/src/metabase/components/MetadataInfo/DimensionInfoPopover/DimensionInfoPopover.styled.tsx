import React from "react";
import styled from "styled-components";
import DimensionInfo from "metabase/components/MetadataInfo/DimensionInfo";
import Dimension from "metabase-lib/lib/Dimension";

type DimensionInfoProps = {
  dimension: Dimension;
};

// this makes TypeScript happy until `DimensionInfo` is typed
function _DimensionInfo(props: DimensionInfoProps) {
  return <DimensionInfo {...props} />;
}

export const WidthBoundDimensionInfo = styled(_DimensionInfo)`
  min-width: 300px;
  max-width: 300px;
`;
