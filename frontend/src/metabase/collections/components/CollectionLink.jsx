import styled from "styled-components"
import Link from "metabase/components/Link"
import { color } from "metabase/lib/colors"

import { SIDEBAR_SPACER } from "../constants"

const CollectionLink = styled(Link)`
  position: relative;
  padding-left: ${props =>
    props.depth * (SIDEBAR_SPACER * 2) + SIDEBAR_SPACER}px;
  padding-right: 8px;
  padding-top: 8px;
  padding-bottom: 8px;
  display: flex;
  margin-left: ${props => -props.depth * SIDEBAR_SPACER}px;
  align-items: center;
  font-weight: bold;
  color: ${props => (props.selected ? "white" : color("brand"))};
  background-color: ${props =>
    props.selected ? color("brand") : "inherit"};
  :hover {
    background-color: ${props => !props.selected && color("bg-medium")};
  }
  .Icon {
    fill: ${props => props.selected && "white"};
    opacity: ${props => props.selected && "0.8"};
  }
`;

CollectionLink.defaultProps = {
  depth: 1,
};

export default CollectionLink