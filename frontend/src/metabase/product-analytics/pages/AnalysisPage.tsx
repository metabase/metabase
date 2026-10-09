import { t } from "ttag";

import { skipToken, useGetTableQuery } from "metabase/api";
import { NotFound } from "metabase/common/components/ErrorPages";
import { useParams, useSearchParams } from "metabase/router";
import { Box, Group, Stack, Title } from "metabase/ui";
import { isConcreteTableId } from "metabase-types/api";
import type { ConcreteTableId } from "metabase-types/api";

import { getAnalysisConfig, isAnalysisKind } from "../analyses/config";
import { AnalysisResult } from "../components/AnalysisResult";
import { AnalysisToolbar } from "../components/AnalysisToolbar";
import { SettingsPanel } from "../components/SettingsPanel";
import type { AnalysisKind } from "../spec/types";
import { useAnalysisQuery } from "../use-analysis-query";
import { useAnalysisState } from "../use-analysis-state";

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

type AnalysisWorkspaceProps = {
  kind: AnalysisKind;
  tableId: ConcreteTableId | undefined;
};

const AnalysisWorkspace = ({ kind, tableId }: AnalysisWorkspaceProps) => {
  const config = getAnalysisConfig(kind);
  const { state, dispatch } = useAnalysisState(kind);
  const table = useGetTableQuery(
    tableId !== undefined ? { id: tableId } : skipToken,
  );
  const { sql, dataset, datasetQuery, warnings, isLoading, error } =
    useAnalysisQuery({
      spec: state.spec,
      tableId,
      dateFilter: state.dateFilter,
    });

  const tableName = table.data?.display_name ?? t`this table`;

  return (
    <Box p="xl">
      <Stack gap="lg">
        <Title order={2}>{t`${config.name} analysis on ${tableName}`}</Title>
        <AnalysisToolbar
          config={config}
          state={state}
          sql={sql}
          onPanelChange={(panel) => dispatch({ type: "set-panel", panel })}
          onGrainChange={(grain) => dispatch({ type: "set-grain", grain })}
          onDateFilterChange={(dateFilter) =>
            dispatch({ type: "set-date-filter", dateFilter })
          }
          onSpecChange={(spec) => dispatch({ type: "set-spec", spec })}
        />
        <Group align="flex-start" gap="lg" wrap="nowrap">
          <SettingsPanel panel={state.panel} />
          <AnalysisResult
            config={config}
            spec={state.spec}
            dataset={dataset}
            datasetQuery={datasetQuery}
            isLoading={isLoading}
            error={
              error ??
              (tableId === undefined
                ? t`Choose a table to analyze.`
                : undefined)
            }
            warnings={warnings}
          />
        </Group>
      </Stack>
    </Box>
  );
};
