import { DependencyFlow } from "../../components/DependencyFlow";

import type { DependencyFlowParams } from "./types";
import { parseParams } from "./utils";

type DependencyFlowPageProps = {
  params?: DependencyFlowParams;
};

export function DependencyFlowPage({ params }: DependencyFlowPageProps) {
  const entry = parseParams(params);
  return <DependencyFlow entry={entry} />;
}
