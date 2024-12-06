import type { MantineThemeOverride } from "@mantine/core";
import cx from "classnames";
import { t } from "ttag";

import Animation from "metabase/css/core/animation.module.css";
import ZIndex from "metabase/css/core/z-index.module.css";
import * as EmotionAnimation from "metabase/css/core/animation.styled";

const DEFAULT_MODAL_SPACING = "lg";

export const getModalOverrides = (): MantineThemeOverride["components"] => ({
  Modal: {
    classNames: {
      overlay: cx(ZIndex.Overlay, Animation.fadeIn),
      inner: cx(ZIndex.Overlay),
    },
    defaultProps: {
      padding: DEFAULT_MODAL_SPACING,
    },
    styles: (theme, _, { variant }) => ({
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
        //animation: `0.15s ease-out 0s 1 ${variant === "sidesheet" ? EmotionAnimation.slideLeft : EmotionAnimation.popInFromBottom}`,
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
