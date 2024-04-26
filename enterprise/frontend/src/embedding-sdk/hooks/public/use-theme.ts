// import { useTheme as useEmotionTheme } from "@emotion/react";
import { useMantineTheme } from "@mantine/core";

import type { MetabaseTheme } from "../../theme/types";

// TODO? add an optional selector to get a specific theme value
export function useMetabaseTheme(): MetabaseTheme {
  return useMantineTheme();
}

// ignore this - testing types
const _sample: MetabaseTheme = {
  labels: {
    fontSize: 24,
    color: "royalblue",
  },
  smartScalar: {
    value: { fontSize: 18 },
  },
};
