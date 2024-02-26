import styled from "@emotion/styled";

import { color as brandColor, color } from "metabase/lib/colors";

export interface AvatarProps {
  color?: string;
  height?: string[];
  width?: string[];
  bg?: string;
}

export const Avatar = styled.div<AvatarProps>`
  color: ${color("white")};
  width: 3em;
  height: 3em;
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 999px;
  font-weight: 900;
  line-height: 1;
  background-color: ${({ bg = brandColor("brand") }) => bg};
  flex-shrink: 0;
`;
