import styled from "@emotion/styled";

import { space } from "metabase/styled-components/theme";

import SidebarLink from "./SidebarLink";
import { collectionDragAndDropHoverStyle } from "./SidebarItems.styled";

export const DataAppLink = styled(SidebarLink)<{ isHovered: boolean }>`
  padding-left: ${space(2)};

  ${props => props.isHovered && collectionDragAndDropHoverStyle}
`;
