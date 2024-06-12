import "@emotion/react";
import '@mantine/core';
import type { MantineTheme } from "@mantine/core";
import type { EmotionStyles, EmotionSx } from '@mantine/emotion';

declare module "@emotion/react" {
  export interface Theme extends MantineTheme {}
}

declare module '@mantine/core' {
  export interface BoxProps {
    sx?: EmotionSx;
    styles?: EmotionStyles;
  }
}