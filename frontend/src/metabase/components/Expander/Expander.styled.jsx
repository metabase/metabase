import styled from "styled-components";
import { color, lighten } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

export const ExpanderRoot = styled.button`
  display: flex;
  align-items: center;
  color: ${color("brand")};
  cursor: pointer;
  font-weight: bold;

  &:hover,
  &:focus {
    color: ${lighten("brand", 0.12)};
  }
`;

export const ExpanderContent = styled.span`
  margin-right: 0.5rem;
`;

export const ExpanderIcon = styled(Icon)`
  width: 0.75rem;
  height: 0.75rem;
  transform: translateY(2px);
`;
