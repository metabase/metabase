import { NotFound } from "metabase/common/components/ErrorPages";
import { useParams, useSearchParams } from "metabase/router";
import { isConcreteTableId } from "metabase-types/api";
import type { ConcreteTableId } from "metabase-types/api";

import { isAnalysisKind } from "../analyses/config";
import { AnalysisWorkspace } from "../components/AnalysisWorkspace";

const parseTableId = (value: string | null): ConcreteTableId | undefined => {
  if (value === null || !/^\d+$/.test(value)) {
    return undefined;
  }
  const id = Number(value);
  return isConcreteTableId(id) ? id : undefined;
};

export const AnalysisPage = () => {
  const { kind } = useParams<{ kind: string }>();
  const [searchParams] = useSearchParams();
  const tableId = parseTableId(searchParams.get("table"));

  if (!isAnalysisKind(kind)) {
    return <NotFound />;
  }

  return <AnalysisWorkspace key={kind} kind={kind} tableId={tableId} />;
};
