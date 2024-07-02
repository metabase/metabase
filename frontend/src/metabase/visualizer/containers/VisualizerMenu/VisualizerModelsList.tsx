import type { ModelResult } from "metabase/browse/types";
import { useFetchModels } from "metabase/common/hooks/use-fetch-models";
import { VisualizerMenuItem } from "metabase/visualizer/components/VisualizerMenuItem";

export function VisualizerModelsList({
  onReplace,
}: {
  onReplace: (item: any) => void;
}) {
  const modelsResult = useFetchModels();
  const models = modelsResult.data?.data as ModelResult[] | undefined;

  return (
    <div>
      {models?.map(model => (
        <VisualizerMenuItem
          key={model.id}
          item={model}
          isAddable={false}
          onAdd={onReplace}
          onReplace={onReplace}
        />
      ))}
    </div>
  );
}
