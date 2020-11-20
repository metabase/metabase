import styled from "styled-components";
import Link from "metabase/components/Link";
import { color } from "metabase/lib/colors";

import { SIDEBAR_SPACER } from "../constants";

const CollectionLink = styled(Link)`
  margin-left: ${props =>
    // use negative margin to reset our potentially nested item back by the depth
    -props.depth * SIDEBAR_SPACER}px;
  padding-left: ${props =>
    // now pad it by the depth so we get hover states that are the full width of the sidebar
    props.depth * (SIDEBAR_SPACER * 2) + SIDEBAR_SPACER}px;
  position: relative;
  padding-right: 8px;
  padding-top: 8px;
  padding-bottom: 8px;
  display: flex;
  flex-shrink: 0;
  align-items: center;
  font-weight: bold;
  color: ${props => (props.selected ? "white" : color("brand"))};
  background-color: ${props =>
    props.selected
      ? color("brand")
      : props.hovered
      ? color("brand-light")
      : "inherit"};
  :hover {
    background-color: ${props =>
      props.selected
        ? false
        : props.hovered
        ? color("brand")
        : color("bg-medium")};
  }
  .Icon {
    fill: ${props => props.selected && "white"};
    opacity: ${props => props.selected && "0.8"};
  }
`;

CollectionLink.defaultProps = {
  depth: 1,
};

export default CollectionLink;
