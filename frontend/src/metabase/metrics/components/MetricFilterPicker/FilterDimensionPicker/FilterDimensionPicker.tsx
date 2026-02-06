import { useCallback, useMemo } from "react";

import { AccordionList } from "metabase/common/components/AccordionList";
import { getDimensionIcon } from "metabase/metrics/utils/dimensions";
import { Icon } from "metabase/ui";
import type * as LibMetric from "metabase-lib/metric";

import { WIDTH } from "../constants";

import type { DimensionListItem, DimensionSection } from "./types";
import { getSections } from "./utils";

interface FilterDimensionPickerProps {
  definitions: LibMetric.MetricDefinition[];
  onChange: (
    definition: LibMetric.MetricDefinition,
    dimension: LibMetric.DimensionMetadata,
  ) => void;
}

export function FilterDimensionPicker({
  definitions,
  onChange,
}: FilterDimensionPickerProps) {
  const sections = useMemo(() => getSections(definitions), [definitions]);

  const handleSelect = useCallback(
    (item: DimensionListItem) => {
      onChange(item.definition, item.dimension);
    },
    [onChange],
  );

  const renderItemIcon = useCallback((item: DimensionListItem) => {
    const icon = getDimensionIcon(item.dimension);
    return <Icon name={icon} size={18} />;
  }, []);

  return (
    <AccordionList<DimensionListItem, DimensionSection>
      sections={sections}
      onChange={handleSelect}
      renderItemName={(item) => item.name}
      renderItemDescription={() => undefined}
      renderItemIcon={renderItemIcon}
      width={WIDTH}
      maxHeight={Infinity}
      itemTestId="dimension-list-item"
    />
  );
}
