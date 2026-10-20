import { useLocation, useNavigate, useSearchParams } from "metabase/router";
import { isConcreteTableId } from "metabase-types/api";
import type { ConcreteTableId } from "metabase-types/api";

import { isAnalysisKind } from "../analyses/config";
import { AnalysisWorkspace } from "../components/AnalysisWorkspace";
import type { AnalysisKind } from "../spec/types";

const DEFAULT_KIND: AnalysisKind = "funnel";

const parseTableId = (value: string | null): ConcreteTableId | undefined => {
  if (value === null || !/^\d+$/.test(value)) {
    return undefined;
  }
  const id = Number(value);
  return isConcreteTableId(id) ? id : undefined;
};

/**
 * A new analysis: the kind and table live in the query string, the settings
 * in the hash. Without a table, the page waits for one to be picked.
 */
export const NewAnalysisPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const kindParam = searchParams.get("kind");
  const kind = isAnalysisKind(kindParam) ? kindParam : DEFAULT_KIND;
  const tableId = parseTableId(searchParams.get("table"));

  const handleTableChange = (id: ConcreteTableId) => {
    const next = new URLSearchParams(searchParams);
    next.set("table", String(id));
    navigate(
      {
        pathname: location.pathname,
        search: `?${next.toString()}`,
        hash: location.hash,
      },
      { replace: true },
    );
  };

  return (
    <AnalysisWorkspace
      kind={kind}
      tableId={tableId}
      onTableChange={handleTableChange}
    />
  );
};
