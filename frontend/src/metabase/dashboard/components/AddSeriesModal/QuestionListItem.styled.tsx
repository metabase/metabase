import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export const QuestionListItemRoot = styled.li`
  align-items: center;
  display: flex;
  margin: 0;
  min-height: 36px;
  padding: 0.25rem 0.5rem 0.25rem 0.75rem;

  &:first-child {
    padding-top: 0.5rem;
  }

  &:last-child {
    padding-bottom: 0.5rem;
  }
`;

export const CheckboxContainer = styled.div`
  display: inline-block;
  padding: 0 0.5rem 0 0;
  max-width: 100%;
  width: 100%;
`;

export const WarningIcon = styled(Icon)`
  color: ${color("text-light")};
  cursor: pointer;
  margin-left: auto;
  max-width: 36px;
  padding: 0 0.5rem;

  &:hover {
    color: ${color("text-medium")};
  }
`;

WarningIcon.defaultProps = { size: 20, name: "warning" };
