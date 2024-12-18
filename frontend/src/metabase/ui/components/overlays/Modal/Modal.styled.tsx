import type { MantineThemeOverride } from "@mantine/core";
import cx from "classnames";
import { t } from "ttag";

import Animation from "metabase/css/core/animation.module.css";
import ZIndex from "metabase/css/core/z-index.module.css";

const DEFAULT_MODAL_SPACING = "lg";

export const getModalOverrides = (): MantineThemeOverride["components"] => ({
  Modal: {
    classNames: {
      overlay: cx(ZIndex.Overlay, Animation.fadeIn),
      content: cx(ZIndex.Overlay, Animation.popInFromBottom),
    },
    defaultProps: {
      padding: DEFAULT_MODAL_SPACING,
    },
    styles: theme => ({
      root: {
        color: "var(--mb-color-text-dark)",
      },
      title: {
        fontSize: theme.fontSizes.xl,
        fontWeight: 700,
      },
      overlay: {
        backgroundColor: theme.fn.rgba(theme.fn.themeColor("bg-black"), 0.6),
      },
      content: {
        backgroundColor: "var(--mb-color-background)",
      },
      header: {
        backgroundColor: "var(--mb-color-background)",
      },
    }),
  },
  ModalRoot: {
    defaultProps: {
      centered: true,
      size: "lg",
      shadow: "md",
      radius: "sm",
      // NOTE: frontend/src/metabase/ui/components/overlays/Modal/index.tsx assumes that withinPortal is true by default
      withinPortal: true,
    },
  },
  ModalHeader: {
    defaultProps: {
      pb: "sm",
    },
  },
  ModalCloseButton: {
    defaultProps: {
      "aria-label": t`Close`,
    },
  },
});
