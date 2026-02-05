import { useMemo } from "react";

import { trackSimpleEvent } from "metabase/lib/analytics";
import { useSelector } from "metabase/lib/redux";
import { Center, Icon, SegmentedControl } from "metabase/ui";
import visualizations from "metabase/visualizations";
import { getVisualizerRawSeries } from "metabase/visualizer/selectors";
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
  const series = useSelector(getVisualizerRawSeries);

  const options = useMemo(() => {
    const [mainSeries] = series ?? [];
    const { data } = mainSeries ?? {};
    return Array.from(visualizations)
      .filter(([, viz]) => !viz.hidden && viz.supportsVisualizer)
      .map(([vizType, viz]) => {
        return {
          label: viz.getUiName(),
          value: vizType,
          icon: viz.iconName,
          isSensible: Boolean(
            data && (viz.getSensibility?.(data) ?? "nonsensible") !== "nonsensible",
          ),
        };
      });
  }, [series]);

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
              <Icon data-testid={o.value} name={o.icon} />
            </Center>
          ),
        }))}
        data-testid="viz-picker-main"
      />
    </>
  );
}
