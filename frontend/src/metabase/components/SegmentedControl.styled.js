import styled from "styled-components";
import { color } from "metabase/lib/colors";

const BORDER_RADIUS = "8px";

export const SegmentedList = styled.ul`
  display: flex;
`;

export const SegmentedItem = styled.li`
  display: flex;
  align-items: center;
  font-weight: bold;
  cursor: pointer;
  color: ${props => (props.isSelected ? color(props.selectedColor) : null)};
  padding: 6px 12px;

  border: 1px solid ${color("border")};
  border-right-width: ${props => (props.isLast ? "1px" : 0)};
  border-top-left-radius: ${props => (props.isFirst ? BORDER_RADIUS : 0)};
  border-bottom-left-radius: ${props => (props.isFirst ? BORDER_RADIUS : 0)};
  border-top-right-radius: ${props => (props.isLast ? BORDER_RADIUS : 0)};
  border-bottom-right-radius: ${props => (props.isLast ? BORDER_RADIUS : 0)};

  :hover {
    color: ${props => (!props.isSelected ? color(props.selectedColor) : null)};
  }
`;
