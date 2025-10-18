import { DependencyLineage } from "../../components/DependencyLineage";
import type { DependencyLineageRawParams } from "../../types";

import { parseParams } from "./utils";

type DependencyLineagePageProps = {
  params?: DependencyLineageRawParams;
};

export function DependencyLineagePage({ params }: DependencyLineagePageProps) {
  const { entry } = parseParams(params);
  return <DependencyLineage entry={entry} />;
}
