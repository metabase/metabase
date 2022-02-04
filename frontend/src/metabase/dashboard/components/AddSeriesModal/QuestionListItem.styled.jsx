import styled from "styled-components";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

export const QuestionListItemRoot = styled.li`
  display: flex;
  align-items: center;
  margin: 0.5rem 0;
  padding: 0.5rem 0 0.5rem 1rem;

  opacity: ${props => (props.isDisabled ? 0.5 : 1)};
  pointer-events: ${props => (props.isDisabled ? "none" : "all")};
`;

export const CheckboxContainer = styled.li`
  display: flex;
  flex-shrink: 0;
  padding: 0 0.5rem;
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
