import { msgid, ngettext, t } from "ttag";

import {
  type NumberFormatter,
  useNumberFormatter,
} from "metabase/common/hooks/use-number-formatter";
import { Group, Text } from "metabase/ui";

import { NavButton } from "./NavButton";

interface Props {
  index: number;
  rowsCount: number;
  onNextClick?: () => void;
  onPreviousClick?: () => void;
}

export const Footer = ({
  index,
  rowsCount,
  onNextClick,
  onPreviousClick,
}: Props) => {
  const formatNumber = useNumberFormatter();

  return (
    <Group gap="xl" justify="space-between" pl="md" pr="xl" py="sm">
      <Text c="text-secondary" fw="bold">
        {formatRowCount(index, rowsCount, formatNumber)}
      </Text>

      <Group align="center" flex="0 0 auto" gap="sm">
        <NavButton
          icon="chevronleft"
          tooltip={t`Previous record`}
          onClick={onPreviousClick}
        />

        <NavButton
          icon="chevronright"
          tooltip={t`Next record`}
          onClick={onNextClick}
        />
      </Group>
    </Group>
  );
};

const formatRowCount = (
  index: number,
  rowsCount: number,
  formatNumber: NumberFormatter,
) => {
  const indexString = formatNumber(index + 1);
  const rowsCountString = formatNumber(rowsCount);

  return ngettext(
    msgid`${indexString} of ${rowsCountString} record`,
    `${indexString} of ${rowsCountString} records`,
    rowsCount,
  );
};
