import cx from "classnames";
import { t } from "ttag";

import { PinDropTarget } from "metabase/common/components/dnd/PinDropTarget";
import { Box, Flex, Icon, rem } from "metabase/ui";

import S from "./PinDropZone.module.css";

type PinDropZoneProps = {
  variant: "pin" | "unpin";
  empty?: boolean;
};

type PinDropTargetRenderArgs = {
  hovered: boolean;
  highlighted: boolean;
};

function PinDropZone({ variant, empty }: PinDropZoneProps) {
  return (
    <PinDropTarget
      className={S.dropTarget}
      variant={variant}
      pinIndex={variant === "pin" ? 1 : null}
      hideUntilDrag
    >
      {({ hovered, highlighted }: PinDropTargetRenderArgs) => {
        if (!hovered && !highlighted) {
          return null;
        }

        if (empty) {
          return (
            <Flex
              className={cx(S.emptyTarget, { [S.emptyTargetHovered]: hovered })}
              mih={rem(32)}
              align="center"
              justify="center"
              gap="sm"
              bdrs="sm"
              c="core-brand"
              fw="bold"
            >
              <Icon name="pin" />
              {t`Drag here to pin`}
            </Flex>
          );
        }

        return (
          <Box
            className={cx(S.indicator, { [S.hovered]: hovered })}
            mih={rem(32)}
          />
        );
      }}
    </PinDropTarget>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default PinDropZone;
