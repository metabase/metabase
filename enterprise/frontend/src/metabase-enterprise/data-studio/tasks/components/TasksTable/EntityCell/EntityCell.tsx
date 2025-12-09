import { Ellipsified } from "metabase/common/components/Ellipsified";
import { BaseCell } from "metabase/data-grid";
import { Anchor, FixedSizeIcon, Flex, type IconName } from "metabase/ui";

import S from "./EntityCell.module.css";

type EntityCellProps = {
  name: string;
  icon: IconName;
  url?: string | null;
};

export function EntityCell({ name, icon, url }: EntityCellProps) {
  return (
    <BaseCell>
      {url ? (
        <Anchor href={url} className={S.cellContent}>
          <Flex align="center" gap="sm">
            <FixedSizeIcon name={icon} />
            <Ellipsified>{name}</Ellipsified>
          </Flex>
        </Anchor>
      ) : (
        <Flex align="center" gap="sm" className={S.cellContent}>
          <FixedSizeIcon name={icon} c="text-medium" />
          <Ellipsified>{name}</Ellipsified>
        </Flex>
      )}
    </BaseCell>
  );
}
