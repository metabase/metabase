import styled from "@emotion/styled";
import type { TextProps } from "@mantine/core";
import { Text } from "@mantine/core";

export const FileInputText = styled(Text)<TextProps>`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;
