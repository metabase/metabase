import { Ellipsified } from "metabase/common/components/Ellipsified";
import { BaseCell } from "metabase/data-grid";
import type { IconName } from "metabase/ui";
import { Anchor, Flex, Icon } from "metabase/ui";

import S from "./TasksTable.module.css";

const centeredCellStyles = { alignItems: "center" } as const;

type TextCellProps = {
  value: string;
  align?: "left" | "right";
};

export function TextCell({ value, align = "left" }: TextCellProps) {
  return (
    <BaseCell align={align} style={centeredCellStyles}>
      <Ellipsified>{value}</Ellipsified>
    </BaseCell>
  );
}

type EntityCellProps = {
  name: string;
  icon: IconName;
  url?: string | null;
};

export function EntityCell({ name, icon, url }: EntityCellProps) {
  return (
    <BaseCell style={centeredCellStyles}>
      {url ? (
        <Anchor href={url} className={S.cellContent}>
          <Flex align="center" gap="sm">
            <Icon name={icon} className={S.iconNoShrink} />
            <Ellipsified>{name}</Ellipsified>
          </Flex>
        </Anchor>
      ) : (
        <Flex align="center" gap="sm" className={S.cellContent}>
          <Icon name={icon} c="text-medium" className={S.iconNoShrink} />
          <Ellipsified>{name}</Ellipsified>
        </Flex>
      )}
    </BaseCell>
  );
}

type LinkCellProps = {
  value: string;
  url?: string | null;
};

export function LinkCell({ value, url }: LinkCellProps) {
  return (
    <BaseCell style={centeredCellStyles}>
      {url ? (
        <Anchor href={url}>
          <Ellipsified>{value}</Ellipsified>
        </Anchor>
      ) : (
        <Ellipsified>{value}</Ellipsified>
      )}
    </BaseCell>
  );
}
