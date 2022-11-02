import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

import Button from "metabase/core/components/Button";

export const DataReferenceContainer = styled.div<{ isOpen: boolean }>`
  flex: ${props => (props.isOpen ? 1 : 0)} 1 0;
  overflow: ${props => (props.isOpen ? "auto" : "hidden")};
  position: relative;
  height: 100%;
  background-color: ${color("white")};
  border-left: 1px solid ${color("border")};
  border-right: 1px solid ${color("border")};
  transition: flex-grow 500ms ease-in-out,
    opacity 250ms ease-in-out ${props => (props.isOpen ? "250ms" : "")};
  opacity: ${props => (props.isOpen ? 1 : 0)};

  .sidebar-header {
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
