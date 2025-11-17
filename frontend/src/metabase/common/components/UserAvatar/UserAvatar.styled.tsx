// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { color } from "metabase/ui/utils/colors";

export interface AvatarProps {
  color?: string;
  height?: string[];
  width?: string[];
  bg?: string;
}

export const Avatar = styled.div<AvatarProps>`
  color: var(--mb-color-text-primary-inverse);
  width: 3em;
  height: 3em;
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 999px;
  font-weight: 900;
  line-height: 1;
  background-color: ${({ bg = color("brand") }) => bg};
  flex-shrink: 0;
`;
