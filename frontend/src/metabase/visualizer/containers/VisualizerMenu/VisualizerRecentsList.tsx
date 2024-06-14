import { useListRecentsQuery } from "metabase/api";
import { VisualizerMenuItem } from "metabase/visualizer/components/VisualizerMenuItem";

export function VisualizerRecentsList() {
  const { data: recents } = useListRecentsQuery();
  return (
    <div>
      {recents?.map((recent: any) => (
        <VisualizerMenuItem key={recent.id} item={recent} />
      ))}
    </div>
  );
}
