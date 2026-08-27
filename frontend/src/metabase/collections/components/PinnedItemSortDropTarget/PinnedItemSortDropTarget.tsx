import cx from "classnames";

import { PinnedItemSortDropTarget as PinnedItemSortDropArea } from "metabase/common/components/dnd/PinnedItemSortDropTarget";

import S from "./PinnedItemSortDropTarget.module.css";

type PinDropTargetProps = {
  isBackTarget?: boolean;
  isFrontTarget?: boolean;
  pinIndex?: number | null;
  enableDropTargetBackground?: boolean;
};

type PinDropTargetRenderArgs = PinDropTargetProps & {
  hovered: boolean;
  highlighted: boolean;
};

export function PinnedItemSortDropTarget(props: PinDropTargetProps) {
  return (
    <PinnedItemSortDropArea className={S.dropTarget} {...props}>
      {({
        isFrontTarget,
        isBackTarget,
        hovered,
        highlighted,
      }: PinDropTargetRenderArgs) => (
        <div
          className={cx(S.indicator, {
            [S.visible]: hovered || highlighted,
            [S.front]: isFrontTarget,
            [S.back]: isBackTarget,
            [S.hovered]: hovered,
          })}
        />
      )}
    </PinnedItemSortDropArea>
  );
}
