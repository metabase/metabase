import { useMemo, useState } from "react";
import { t } from "ttag";

import { Box, Button, DefaultSelectItem, Icon, Popover } from "metabase/ui";
import * as LibMetric from "metabase-lib/metric";
import type { DimensionMetadata, MetricDefinition, ProjectionClause } from "metabase-lib/metric";

import { UNBINNED } from "../../../constants";

import S from "../MetricControls.module.css";
const MIN_WIDTH = 180;

type BinningButtonProps = {
  definition: MetricDefinition;
  dimension: DimensionMetadata;
  projection: ProjectionClause;
  onBinningChange: (binningStrategy: string | null) => void;
};

export function BinningButton({
  definition,
  dimension,
  projection,
  onBinningChange,
}: BinningButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const { hasBinning, availableStrategies, displayLabel } = useMemo(() => {
    const binningVal = LibMetric.binning(projection);
    const strategies = LibMetric.availableBinningStrategies(definition, dimension);

    const items = strategies.map((strategy) => {
      const info = LibMetric.displayInfo(definition, strategy);
      return {
        bucket: strategy,
        displayName: info.displayName,
        isSelected: info.selected ?? false,
        isDefault: info.default ?? false,
      };
    });

    const selectedItem = items.find(item => item.isSelected);
    const defaultItem = items.find(item => item.isDefault);

    let label: string;
    if (binningVal) {
      label = selectedItem?.displayName ?? defaultItem?.displayName ?? t`Binned`;
    } else {
      label = t`Unbinned`;
    }

    return { hasBinning: !!binningVal, availableStrategies: items, displayLabel: label };
  }, [definition, dimension, projection]);

  const handleSelect = (binningName: string | null) => {
    onBinningChange(binningName);
    setIsOpen(false);
  };

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
              selected={item.isSelected}
              onClick={() => handleSelect(item.displayName)}
              role="option"
            />
          ))}
          <DefaultSelectItem
            value={t`Don't bin`}
            selected={!hasBinning}
            onClick={() => handleSelect(UNBINNED)}
            role="option"
          />
        </Box>
      </Popover.Dropdown>
    </Popover>
  );
}
