import type {
  ModalCloseButtonProps,
  ModalFactory,
  ModalHeaderProps,
  ModalRootProps,
} from "@mantine/core";
import cx from "classnames";
import { t } from "ttag";

import Animation from "metabase/css/core/animation.module.css";
import Layout from "metabase/css/core/layout.module.css";
import ZIndex from "metabase/css/core/z-index.module.css";

import { themeComponent } from "../../../utils/theme-component";

const DEFAULT_MODAL_SPACING = "lg";

import Styles from "./Modal.module.css";

// Mantine does not re-export these payload types from the package root.
type ModalRootPayload = { props: ModalRootProps };
type ModalHeaderPayload = { props: ModalHeaderProps };
type ModalCloseButtonPayload = { props: ModalCloseButtonProps };

export const modalOverrides = {
  Modal: themeComponent<ModalFactory>({
    defaultProps: {
      padding: DEFAULT_MODAL_SPACING,
    },
    classNames: {
      root: Styles.root,
      title: Styles.title,
      overlay: cx(Styles.overlay, ZIndex.Overlay, Animation.fadeIn),
      content: cx(Styles.content, ZIndex.Overlay, Animation.popInFromBottom),
      inner: cx(ZIndex.Overlay, Layout.left, Animation.popInFromBottom),
      header: Styles.header,
      close: Styles.ModalCloseButton,
    },
  }),

  ModalRoot: themeComponent<ModalRootPayload>({
    defaultProps: {
      centered: true,
      size: "lg",
      shadow: "md",
      radius: "sm",
      withinPortal: true,
    },
  }),

  ModalHeader: themeComponent<ModalHeaderPayload>({
    defaultProps: {
      pb: "sm",
    },
  }),

  ModalCloseButton: themeComponent<ModalCloseButtonPayload>({
    defaultProps: {
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      "aria-label": t`Close`,
    },
  }),
};
