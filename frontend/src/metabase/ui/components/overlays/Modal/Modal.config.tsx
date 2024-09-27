import { Modal } from "@mantine/core";
import { t } from "ttag";
import cx from "classnames";
import Animation from "metabase/css/core/animation.module.css";
import ZIndex from "metabase/css/core/z-index.module.css";

export const DEFAULT_MODAL_Z_INDEX = 200;
const DEFAULT_MODAL_SPACING = "lg";

import Styles from "./Modal.module.css";

export const modalOverrides = {
  Modal: Modal.extend({
    defaultProps: {
      padding: DEFAULT_MODAL_SPACING,
    },
    classNames: {
      root: Styles.root,
      title: Styles.title,
      overlay: cx(Styles.overlay, ZIndex.Overlay, Animation.fadeIn),
      content: cx(Styles.content, ZIndex.Overlay, Animation.popInFromBottom),
      header: Styles.header,
      close: Styles.ModalCloseButton,
    },
  }),

  ModalRoot: Modal.Root.extend({
    defaultProps: {
      centered: true,
      size: "lg",
      shadow: "md",
      radius: "sm",
      withinPortal: true,
    },
  }),

  ModalHeader: Modal.Header.extend({
    defaultProps: {
      pb: "sm",
    },
  }),

  ModalCloseButton: Modal.CloseButton.extend({
    defaultProps: {
      "aria-label": t`Close`,
    },
  }),
};
