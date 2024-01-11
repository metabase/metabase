import styled from "@emotion/styled";
import FieldInfo from "metabase/components/MetadataInfo/FieldInfo";
import type Dimension from "metabase-lib/Dimension";

type DimensionInfoProps = {
  dimension: Dimension;
};

// this makes TypeScript happy until `FieldInfo` is typed
function _FieldInfo(props: DimensionInfoProps) {
  return <FieldInfo {...props} />;
}

export const WidthBoundFieldInfo = styled(_FieldInfo)`
  width: 300px;
  font-size: 14px;
`;
