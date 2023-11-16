import { t } from "ttag";
import type { MantineThemeOverride } from "@mantine/core";

export const getModalOverrides = (): MantineThemeOverride["components"] => ({
  Modal: {
    styles: theme => ({
      title: {
        fontSize: theme.fontSizes.xl,
        fontWeight: 700,
      },
      close: {
        color: theme.colors.text[0],
        ":hover": {
          color: theme.colors.text[1],
        },
      },
      overlay: {
        backgroundColor: theme.fn.rgba(theme.colors.bg[3], 0.6),
      },
    }),
  },
  ModalRoot: {
    defaultProps: {
      centered: true,
      size: "lg",
      shadow: "md",
      radius: "sm",
      withinPortal: true,
    },
  },
  ModalCloseButton: {
    defaultProps: {
      "aria-label": t`Close`,
    },
  },
});
