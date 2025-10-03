import { push } from "react-router-redux";

import { useDispatch } from "metabase/lib/redux";
import type { DependencyEntry } from "metabase-types/api";

import { DependencyFlow } from "../../components/DependencyFlow";
import type { DependencyFlowRawParams } from "../../types";
import { getDependencyFlowUrl } from "../../urls";

import { parseParams } from "./utils";

type DependencyFlowPageProps = {
  params?: DependencyFlowRawParams;
};

export function DependencyFlowPage({ params }: DependencyFlowPageProps) {
  const { entry } = parseParams(params);
  const dispatch = useDispatch();

  const handleEntryChange = (newEntry: DependencyEntry) => {
    dispatch(push(getDependencyFlowUrl({ entry: newEntry })));
  };

  return <DependencyFlow entry={entry} onEntryChange={handleEntryChange} />;
}
