import styled from "@emotion/styled";
import { CopyButton } from "metabase/components/CopyButton";
import { color } from "metabase/lib/colors";

export const CopyWidgetButton = styled(CopyButton)`
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  display: flex;
  align-items: center;
  padding: 0.5rem;
  border-left: 1px solid ${color("border")};
  border-top-right-radius: 4px;
  border-bottom-right-radius: 4px;
  color: ${color("brand")};
  outline: none;
  cursor: pointer;

  &:hover {
    color: ${color("white")};
    background-color: ${color("brand")};
  }
`;
