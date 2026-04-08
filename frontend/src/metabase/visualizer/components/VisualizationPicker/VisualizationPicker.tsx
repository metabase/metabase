import { useMemo } from "react";

import { EntityIcon } from "metabase/common/components/EntityIcon";
import { trackSimpleEvent } from "metabase/lib/analytics";
import { Center, SegmentedControl } from "metabase/ui";
import visualizations from "metabase/visualizations";
import type { VisualizationDisplay } from "metabase-types/api";

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
          iconDarkUrl: viz.iconDarkUrl,
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
                trackSimpleEvent({
                  event: "visualizer_data_changed",
                  event_detail: "visualizer_viz_type_changed",
                  triggered_from: "visualizer-modal",
                });

                onChange(o.value);
              }}
              p="sm"
            >
              <EntityIcon
                data-testid={o.value}
                name={o.icon}
                iconUrl={o.iconUrl}
                iconDarkUrl={o.iconDarkUrl}
              />
            </Center>
          ),
        }))}
        data-testid="viz-picker-main"
      />
    </>
  );
}
