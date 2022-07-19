import styled from "@emotion/styled";
import { color, height, width } from "styled-system";
import { color as brandColor } from "metabase/lib/colors";

export interface AvatarProps {
  color?: string;
  height?: string[];
  width?: string[];
  bg?: string;
}

export const Avatar = styled.div<AvatarProps>`
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 999px;
  font-weight: 900;
  line-height: 1;
  ${height};
  ${width};
  ${color};
  background-color: ${({ bg = brandColor("brand") }) => bg};
`;
Avatar.defaultProps = {
  color: "white",
  height: ["3em"],
  width: ["3em"],
};
