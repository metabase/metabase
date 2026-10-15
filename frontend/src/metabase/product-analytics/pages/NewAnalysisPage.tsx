import { useState } from "react";
import { t } from "ttag";

import { useLazyGetTableQuery } from "metabase/api";
import { useToast } from "metabase/common/hooks";
import { useLocation, useNavigate, useSearchParams } from "metabase/router";
import { isConcreteTableId } from "metabase-types/api";
import type { ConcreteTableId } from "metabase-types/api";

import { isAnalysisKind } from "../analyses/config";
import { AnalysisWorkspace } from "../components/AnalysisWorkspace";
import { getLastTableId } from "../last-table";
import type { AnalysisKind } from "../spec/types";
import { usePrototypeTable } from "../use-prototype-table";

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
 * in the hash. The table defaults to the one last analyzed, then to the
 * prototype's.
 */
export const NewAnalysisPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [sendToast] = useToast();
  const prototype = usePrototypeTable();
  const [fetchTable] = useLazyGetTableQuery();
  const [lastTableId] = useState(getLastTableId);

  const kindParam = searchParams.get("kind");
  const kind = isAnalysisKind(kindParam) ? kindParam : DEFAULT_KIND;
  const tableId =
    parseTableId(searchParams.get("table")) ?? lastTableId ?? prototype.tableId;

  const setParams = (changes: Record<string, string>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(changes).forEach(([key, value]) => next.set(key, value));
    navigate(
      {
        pathname: location.pathname,
        search: `?${next.toString()}`,
        hash: location.hash,
      },
      { replace: true },
    );
  };

  // Prototype: the generated SQL is ClickHouse-only. Lift this once SQL
  // generation moves to MBQL.
  const handleTableChange = async (id: ConcreteTableId) => {
    const { data: table } = await fetchTable({ id }, true);
    if (table && prototype.clickHouseDatabaseIds.includes(table.db_id)) {
      setParams({ table: String(id) });
    } else {
      sendToast({
        icon: "warning",
        message: t`For now, only tables in ClickHouse databases can be analyzed.`,
      });
    }
  };

  return (
    <AnalysisWorkspace
      kind={kind}
      tableId={tableId}
      onKindChange={(nextKind) => setParams({ kind: nextKind })}
      onTableChange={handleTableChange}
      isTableLoading={prototype.isLoading}
      tableError={prototype.error}
    />
  );
};
