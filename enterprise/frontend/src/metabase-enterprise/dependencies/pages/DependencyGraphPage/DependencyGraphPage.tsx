import { DependencyGraph } from "../../components/DependencyGraph";
import type { DependencyLineageRawParams } from "../../types";

import { parseParams } from "./utils";

type DependencyGraphPageProps = {
  params?: DependencyLineageRawParams;
};

export function DependencyGraphPage({ params }: DependencyGraphPageProps) {
  const { entry } = parseParams(params);
  return <DependencyGraph entry={entry} />;
}
