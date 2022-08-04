import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Button from "metabase/core/components/Button";

export interface NotebookButtonProps {
  isShowingNotebook: boolean;
}

export const NotebookButton = styled(Button)<NotebookButtonProps>`
  color: ${props => !props.isShowingNotebook && color("text-dark")};

  &:hover {
    color: ${props => !props.isShowingNotebook && color("brand")};
  }
`;
