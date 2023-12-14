import { t } from "ttag";
import type { MantineThemeOverride } from "@mantine/core";

export const getMultiSelectOverrides =
  (): MantineThemeOverride["components"] => ({
    MultiSelect: {
      defaultProps: {
        getCreateLabel,
      },
    },
  });

function getCreateLabel(query: string) {
  return t`Create ${query}`;
}
