import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

export const QuestionListItemRoot = styled.li`
  display: flex;
  align-items: center;
  margin: 0.5rem 0;
  min-height: 36px;
  padding: 0.25rem 0.5rem 0.25rem 0.75rem;

  opacity: ${props => (props.isDisabled ? 0.5 : 1)};
  pointer-events: ${props => (props.isDisabled ? "none" : "all")};
`;

export const CheckboxContainer = styled.div`
  padding: 0 0.5rem 0 0;
  max-width: 100%;
`;

export const WarningIcon = styled(Icon)`
  padding: 0 0.5rem;
  display: flex;
  margin-left: auto;
  color: ${color("text-light")};
  cursor: pointer;
  flex-shrink: 0;

  &:hover {
    color: ${color("text-medium")};
  }
`;

WarningIcon.defaultProps = { size: 20, name: "warning" };
