import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

interface PermissionIconContainerProps {
  color: string;
}

export const PermissionIconContainer = styled.div<PermissionIconContainerProps>`
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.25rem;
  margin-right: 0.375rem;
  color: ${color("white")};
  background-color: ${props => color(props.color)};
`;
