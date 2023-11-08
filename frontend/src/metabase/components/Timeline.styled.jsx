import styled from "styled-components";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

export const TimelineContainer = styled.div`
  position: relative;
  margin-left: ${props => props.leftShift}px;
  margin-bottom: ${props => props.bottomShift}px;
`;

export const TimelineItem = styled.div`
  display: flex;
  align-items: start;
  justify-content: start;
  transform: translateX(-${props => props.leftShift}px);
  white-space: pre-line;
  width: 100%;
  margin-bottom: 1rem;
`;

export const ItemIcon = styled(Icon)`
  position: relative;
  color: ${props => (props.color ? color(props.color) : color("text-light"))};
`;

export const ItemBody = styled.div`
  margin-left: 0.5rem;
  flex: 1;
`;

export const ItemHeader = styled.div`
  font-weight: 700;
`;

export const Timestamp = styled.time`
  color: ${color("text-medium")}
  font-size: 0.875em;
  padding-bottom: 0.5rem;
`;

export const ItemFooter = styled.div`
  margin-top: 0.5rem;
`;

// shift the border down slightly so that it doesn't appear above the top-most icon
// also using a negative `bottom` to connect the border with the event icon beneath it
export const Border = styled.div`
  position: absolute;
  top: ${props => props.borderShift}px;
  left: ${props => props.borderShift}px;
  bottom: calc(-1rem - ${props => props.borderShift}px);
  border-left: 1px solid ${color("border")};
`;
