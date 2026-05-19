import { useMemo } from "react";

import { EntityIcon } from "metabase/common/components/EntityIcon";
import { Center, SegmentedControl } from "metabase/ui";
import visualizations from "metabase/visualizations";
import type { VisualizationDisplay } from "metabase-types/api";

import { trackVisualizerDataChanged } from "../analytics";

import S from "./VisualizationPicker.module.css";

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

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value),
    [value, options],
  );

  return (
    <>
      <SegmentedControl
        classNames={{
          label: S.SegmentedControlLabel,
        }}
        value={selectedOption?.value}
        data={options.map((o, i) => ({
          value: o.value,
          label: (
            <Center
              key={i}
              onClick={() => {
                trackVisualizerDataChanged("visualizer_viz_type_changed");

                onChange(o.value);
              }}
              p="sm"
            >
              <EntityIcon
                data-testid={o.value}
                name={o.icon}
                iconUrl={o.iconUrl}
              />
            </Center>
          ),
        }))}
        data-testid="viz-picker-main"
      />
    </>
  );
}
