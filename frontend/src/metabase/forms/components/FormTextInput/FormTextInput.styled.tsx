import styled from "@emotion/styled";
import { color } from "metabase/ui/utils/colors";
import { CopyButton } from "metabase/components/CopyButton";

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

  &:hover {
    color: ${color("white")};
    background-color: ${color("brand")};
  }
`;
