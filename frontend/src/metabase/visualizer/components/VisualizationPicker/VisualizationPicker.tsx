import { useMemo } from "react";

import { EntityIcon } from "metabase/common/components/EntityIcon";
import { SegmentedControl } from "metabase/ui";
import { visualizations } from "metabase/viz-core";
import type { VisualizationDisplay } from "metabase-types/api";

import { trackVisualizerDataChanged } from "../analytics";

interface VisualizationPickerProps {
  value: VisualizationDisplay | null;
  onChange: (vizType: string) => void;
}
export function VisualizationPicker({
  value,
  onChange,
}: VisualizationPickerProps) {
  const options = useMemo(() => {
    return Array.from(visualizations)
      .filter(([, viz]) => !viz.hidden && viz.supportsVisualizer)
      .map(([vizType, viz]) => {
        return {
          label: viz.getUiName(),
          value: vizType,
          icon: viz.iconName,
          iconUrl: viz.iconUrl,
        };
      });
  }, []);

  return (
    <>
      <SegmentedControl
        value={value ?? undefined}
        data={options.map((o) => ({
          value: o.value,
          ariaLabel: o.label,
          icon: (
            <EntityIcon
              data-testid={o.value}
              name={o.icon}
              iconUrl={o.iconUrl}
            />
          ),
        }))}
        onChange={(vizType) => {
          trackVisualizerDataChanged("visualizer_viz_type_changed");
          onChange(vizType);
        }}
        data-testid="viz-picker-main"
      />
    </>
  );
}
