import { useMemo, useState } from "react";
import { t } from "ttag";

import { Box, Button, DefaultSelectItem, Icon, Popover } from "metabase/ui";
import * as Lib from "metabase-lib";

import { STAGE_INDEX, UNBINNED } from "../../../constants";

import S from "../MetricControls.module.css";
const MIN_WIDTH = 180;

type BinningButtonProps = {
  query: Lib.Query;
  column: Lib.ColumnMetadata;
  breakout: Lib.BreakoutClause;
  onBinningChange: (binningStrategy: string | null) => void;
};

export function BinningButton({
  query,
  column,
  breakout,
  onBinningChange,
}: BinningButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const { currentBinning, availableStrategies } = useMemo(() => {
    const binning = Lib.binning(breakout);
    const binningInfo = binning
      ? Lib.displayInfo(query, STAGE_INDEX, binning)
      : undefined;
    const strategies = Lib.availableBinningStrategies(
      query,
      STAGE_INDEX,
      column,
    );

    const items = strategies.map((strategy) => {
      const info = Lib.displayInfo(query, STAGE_INDEX, strategy);
      return {
        bucket: strategy,
        displayName: info.displayName,
        isDefault: info.default ?? false,
      };
    });

    return { currentBinning: binningInfo, availableStrategies: items };
  }, [query, column, breakout]);

  const handleSelect = (binningName: string | null) => {
    onBinningChange(binningName);
    setIsOpen(false);
  };

  const displayLabel = currentBinning
    ? currentBinning.displayName
    : t`Unbinned`;

  return (
    <Popover opened={isOpen} onChange={setIsOpen}>
      <Popover.Target>
        <Button
          className={S.controlButton}
          variant="subtle"
          color="text-primary"
          rightSection={<Icon name="chevrondown" size={12} />}
          onClick={() => setIsOpen(!isOpen)}
        >
          {displayLabel}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Box p="sm" miw={MIN_WIDTH}>
          {availableStrategies.map((item) => (
            <DefaultSelectItem
              key={item.displayName}
              value={item.displayName}
              label={item.displayName}
              selected={currentBinning?.displayName === item.displayName}
              onClick={() => handleSelect(item.displayName)}
              role="option"
            />
          ))}
          <DefaultSelectItem
            value={t`Don't bin`}
            selected={!currentBinning}
            onClick={() => handleSelect(UNBINNED)}
            role="option"
          />
        </Box>
      </Popover.Dropdown>
    </Popover>
  );
}
