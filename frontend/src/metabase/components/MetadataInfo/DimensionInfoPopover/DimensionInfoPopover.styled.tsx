import styled from "@emotion/styled";
import DimensionInfo from "metabase/components/MetadataInfo/DimensionInfo";
import Dimension from "metabase-lib/Dimension";

type DimensionInfoProps = {
  dimension: Dimension;
};

// this makes TypeScript happy until `DimensionInfo` is typed
function _DimensionInfo(props: DimensionInfoProps) {
  return <DimensionInfo {...props} />;
}

export const WidthBoundDimensionInfo = styled(_DimensionInfo)`
  width: 300px;
  font-size: 14px;
`;
