import cx from "classnames";
import { forwardRef, type ForwardedRef } from "react";
import { t } from "ttag";
import _ from "underscore";

import Button from "metabase/core/components/Button";
import Tooltip from "metabase/core/components/Tooltip";
import CS from "metabase/css/core/index.css";

import TableS from "./TableInteractive.module.css";
import { ROW_HEIGHT, SIDEBAR_WIDTH } from "./constants";

interface DetailShortcutProps {
  height: number;
  pageWidth: number;
  totalWidth: number;
  onClick: () => void;
}

export const DetailShortcut = forwardRef(function DetailShortcut(
  _props: DetailShortcutProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  return (
    <div
      className={cx(
        TableS.TableInteractiveCellWrapper,
        "test-TableInteractive-cellWrapper",
        CS.cursorPointer,
      )}
      ref={ref}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        height: ROW_HEIGHT,
        width: SIDEBAR_WIDTH,
        zIndex: 3,
      }}
      data-testid="detail-shortcut"
    >
      <Tooltip tooltip={t`View Details`}>
        <Button
          iconOnly
          iconSize={10}
          icon="expand"
          className={CS.TableInteractiveDetailButton}
        />
      </Tooltip>
    </div>
  );
});
