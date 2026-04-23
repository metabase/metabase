import { useCallback } from "react";

import { AccordionList } from "metabase/common/components/AccordionList";
import { getDimensionIcon } from "metabase/metrics/utils/dimensions";
import type {
  DimensionListItem,
  FilterItem,
  MetricGroupFilterSection,
  SegmentListItem,
} from "metabase/metrics-viewer/components/FilterPopover/types";
import { isSegmentListItem } from "metabase/metrics-viewer/components/FilterPopover/types";
import { Icon } from "metabase/ui";

import S from "./FilterPopover.module.css";

export function MetricGroupFilterSectionList({
  sections,
  onDimensionSelect,
  onSegmentSelect,
}: {
  sections: MetricGroupFilterSection[];
  onDimensionSelect: (item: DimensionListItem) => void;
  onSegmentSelect: (item: SegmentListItem) => void;
}) {
  const handleChange = useCallback(
    (item: FilterItem) => {
      if (isSegmentListItem(item)) {
        onSegmentSelect(item);
      } else {
        onDimensionSelect(item);
      }
    },
    [onDimensionSelect, onSegmentSelect],
  );

  const renderItemIcon = useCallback((item: FilterItem) => {
    if (isSegmentListItem(item)) {
      return <Icon name="star" size={16} />;
    }
    return <Icon name={getDimensionIcon(item.dimension)} size={16} />;
  }, []);

  return (
    <AccordionList<FilterItem, MetricGroupFilterSection>
      className={S.dimensionList}
      sections={sections}
      onChange={handleChange}
      renderItemName={(item) => item.name}
      renderItemIcon={renderItemIcon}
      width="100%"
      maxHeight={Infinity}
      searchable={false}
      alwaysExpanded
    />
  );
}
