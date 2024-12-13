import type { WithRouterProps } from "react-router";

import { useVisualizerUrlSync } from "metabase/visualizer/hooks/use-visualizer-url-sync";

import { Visualizer } from "../Visualizer";

export const VisualizerPage = ({ location, router }: WithRouterProps) => {
  useVisualizerUrlSync(location, router);
  return <Visualizer />;
};
