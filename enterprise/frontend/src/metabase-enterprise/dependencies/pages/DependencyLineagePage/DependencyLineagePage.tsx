import { push } from "react-router-redux";

import { useDispatch } from "metabase/lib/redux";
import type { DependencyEntry } from "metabase-types/api";

import { DependencyLineage } from "../../components/DependencyLineage";
import type { DependencyLineageRawParams } from "../../types";
import { getDependencyLineageUrl } from "../../urls";

import { parseParams } from "./utils";

type DependencyLineagePageProps = {
  params?: DependencyLineageRawParams;
};

export function DependencyLineagePage({ params }: DependencyLineagePageProps) {
  const { entry } = parseParams(params);
  const dispatch = useDispatch();

  const handleEntryChange = (newEntry: DependencyEntry) => {
    dispatch(push(getDependencyLineageUrl({ entry: newEntry })));
  };

  return <DependencyLineage entry={entry} onEntryChange={handleEntryChange} />;
}
