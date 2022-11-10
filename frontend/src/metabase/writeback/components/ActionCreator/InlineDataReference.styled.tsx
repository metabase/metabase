import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

import Button from "metabase/core/components/Button";
import SidebarContent from "metabase/query_builder/components/SidebarContent";

export const DataReferenceContainer = styled.div<{ isOpen: boolean }>`
  display: ${props => (props.isOpen ? "block" : "none")};
  overflow: hidden;
  position: relative;
  height: 100%;
  background-color: ${color("white")};
  border-left: 1px solid ${color("border")};
  border-right: 1px solid ${color("border")};

  ${SidebarContent.Header.Root} {
    position: sticky;
    top: 0;
    padding: 1.5rem 1.5rem 0.5rem 1.5rem;
    margin: 0;
    background-color: ${color("white")};
  }
`;

export const TriggerButton = styled(Button)`
  position: absolute;
  top: 76px;
  right: 10px;
  z-index: 10;
`;
