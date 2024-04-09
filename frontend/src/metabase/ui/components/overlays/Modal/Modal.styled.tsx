import type { MantineThemeOverride } from "@mantine/core";
import { t } from "ttag";

// See `zIndex` prop at https://v6.mantine.dev/core/modal/?t=props
export const DEFAULT_MODAL_Z_INDEX = 200;
const DEFAULT_MODAL_SPACING = "lg";

export const getModalOverrides = (): MantineThemeOverride["components"] => ({
  Modal: {
    styles: theme => ({
      title: {
        fontSize: theme.fontSizes.xl,
        fontWeight: 700,
      },
      overlay: {
        backgroundColor: theme.fn.rgba(theme.fn.themeColor("bg-black"), 0.6),
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
  ModalHeader: {
    defaultProps: {
      p: DEFAULT_MODAL_SPACING,
      pb: "sm",
    },
  },
  ModalBody: {
    defaultProps: {
      p: DEFAULT_MODAL_SPACING,
    },
  },
  ModalCloseButton: {
    defaultProps: {
      "aria-label": t`Close`,
    },
  },
});
