import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

import Button from "metabase/core/components/Button";
import SidebarContent from "metabase/query_builder/components/SidebarContent";

const transitionDuration = 300;

export const DataReferenceContainer = styled.div<{ isOpen: boolean }>`
  flex: ${props => (props.isOpen ? 1 : 0)} 1 0;
  overflow: ${props => (props.isOpen ? "auto" : "hidden")};
  position: relative;
  height: 100%;
  background-color: ${color("white")};
  border-left: 1px solid ${color("border")};
  border-right: 1px solid ${color("border")};
  transition: flex-grow ${transitionDuration}ms ease-in-out,
    opacity ${transitionDuration / 2}ms ease-in-out
      ${props => (props.isOpen ? `${transitionDuration / 2}ms` : "")};
  opacity: ${props => (props.isOpen ? 1 : 0)};

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
  top: 10px;
  right: 10px;
  z-index: 10;
`;
