import { DependencyGraph } from "../../components/DependencyGraph";
import type { DependencyGraphRawParams } from "../../types";

import { parseParams } from "./utils";

type DependencyGraphPageProps = {
  params?: DependencyGraphRawParams;
};

export function DependencyGraphPage({ params }: DependencyGraphPageProps) {
  const { entry } = parseParams(params);
  return <DependencyGraph entry={entry} />;
}
