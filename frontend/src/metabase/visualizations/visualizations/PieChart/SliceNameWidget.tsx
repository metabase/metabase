import { SeriesNameInput } from "metabase/visualizations/components/settings/ChartNestedSettingSeries.styled";
import type { PieRow } from "metabase/visualizations/echarts/pie/model/types";

export function SliceNameWidget({
  initialKey,
  pieRows,
  updateRowName,
}: {
  initialKey: string;
  pieRows: PieRow[];
  updateRowName: (newName: string, key: string) => void;
}) {
  const row = pieRows.find(row => row.key === initialKey);
  if (row == null) {
    throw Error(`Could not find pieRow with key ${initialKey}`);
  }

  return (
    <div>
      <SeriesNameInput
        value={row.name}
        subtitle={row.key !== row.name ? row.key : undefined}
        onBlurChange={event => updateRowName(event.target.value, initialKey)}
      />
    </div>
  );
}
