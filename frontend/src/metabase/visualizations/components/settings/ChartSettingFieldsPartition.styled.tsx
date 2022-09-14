import styled from "@emotion/styled";
import Icon from "metabase/components/Icon";
import { color, lighten } from "metabase/lib/colors";

export const ColumnName = styled.span`
  margin-left: 0.625rem;
  flex-grow: 1;
`;

export const ColumnContent = styled.div`
  color: ${color("text-dark")};
  font-weight: 700;
  cursor: grab;
  display: flex;
  align-items: center;
  width: 100%;
  flex-grow: 1;
`;

export const ColumnIcon = styled(Icon)`
  cursor: pointer;
  margin-left: 0.5rem;
  &:hover {
    color: ${color("brand")};
  }
`;

interface DragWrapperProps {
  isDisabled: boolean;
}

export const DragWrapper = styled.div<DragWrapperProps>`
  padding: 0.75rem;
  box-shadow: 0 2px 3px ${lighten("text-dark", 1.5)};
  border: 1px solid ${color("border")};
  border-radius: 0.5rem;
  &:hover {
    box-shadow: 0 2px 5px ${lighten("text-dark", 1.3)};
    transition: all 300ms linear;
  }
  margin-bottom: 0.5rem;

  ${props =>
    props.isDisabled &&
    `
    pointer-events: none;
    opacity: 0.4;
  `}
`;
