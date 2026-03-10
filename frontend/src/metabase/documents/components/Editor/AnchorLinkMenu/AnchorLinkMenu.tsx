import cx from "classnames";
import { type CSSProperties, forwardRef } from "react";
import { createPortal } from "react-dom";

import { Box } from "metabase/ui";

import { AnchorLinkButton } from "./AnchorLinkButton";
import S from "./AnchorLinkMenu.module.css";

interface Props {
  show: boolean;
  style: CSSProperties;
  url: string;
}

export const AnchorLinkMenu = forwardRef<HTMLDivElement, Props>(
  function AnchorLinkMenu({ show, style, url }: Props, ref) {
    return createPortal(
      <Box
        className={cx(S.anchorLinkMenu, {
          [S.visible]: show,
        })}
        contentEditable={false}
        data-testid="anchor-link-menu"
        draggable={false}
        pr="0.75rem"
        ref={ref}
        style={style}
      >
        <AnchorLinkButton url={url} variant="default" />
      </Box>,
      document.body,
    );
  },
);
