import styled from "@emotion/styled";
import { Text } from "@mantine/core";
import type { TextProps } from "@mantine/core";

export const FileInputText = styled(Text)<TextProps>`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;
