import styled from "@emotion/styled";

import {
  QueryColumnInfoIcon,
  HoverParent,
} from "metabase/components/MetadataInfo/ColumnInfoIcon";
export { HoverParent };

export const InfoIcon = styled(QueryColumnInfoIcon)`
  position: relative;
  left: -0.5em;
`;

InfoIcon.defaultProps = {
  position: "left",
};
