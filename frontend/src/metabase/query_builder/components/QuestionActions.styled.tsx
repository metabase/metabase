import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Button from "metabase/core/components/Button";

export const QuestionActionsContainer = styled.div`
  border-left: 1px solid #eeecec;
  margin-left: 1rem;
  padding-left: 1rem;
`;

export const PopoverContainer = styled.div`
  padding: 1rem;
  min-width: 260px;
`;

export const PopoverButton = styled(Button)`
  width: 100%;
  ${Button.Content} {
    justify-content: start;
  }
`;
