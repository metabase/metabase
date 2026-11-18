import { NotFound } from "metabase/common/components/ErrorPages";
import { useLocation, useNavigate, useSearchParams } from "metabase/router";
import * as Urls from "metabase/urls";
import type { TableId } from "metabase-types/api";
import { isProductAnalyticsKind } from "metabase-types/guards";

import { AnalysisWorkspace } from "../components/AnalysisWorkspace";

/** A new analysis, with its kind and table in the query string. */
export const NewAnalysisPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const kind = searchParams.get("kind");
  const tableId = Urls.extractEntityId(searchParams.get("table") ?? undefined);

  if (!isProductAnalyticsKind(kind)) {
    return <NotFound />;
  }

  const handleTableChange = (id: TableId) => {
    if (id !== tableId) {
      navigate(Urls.newProductAnalysis(kind, id));
    }
  };

  return (
    <AnalysisWorkspace
      // Each table gets a fresh workspace. Without a table, navigating to this
      // page again keeps the same URL, so the location's key starts it over.
      key={tableId ?? location.key}
      kind={kind}
      tableId={tableId}
      onTableChange={handleTableChange}
    />
  );
};
