import { useMemo } from "react";
import { t } from "ttag";

import {
  Alert,
  Box,
  Ellipsified,
  Loader,
  Text,
  Tooltip,
  TreeTable,
  type TreeTableColumnDef,
  useTreeTableInstance,
} from "metabase/ui";
import { formatNumber } from "metabase/utils/formatting";

import type { PathStep } from "../../path-steps/rows";
import type { PathSteps } from "../../path-steps/use-path-steps";

import { SupportingPanel } from "./SupportingPanel";

const TABLE_MAX_HEIGHT_PX = 480;
const ROW_HEIGHT_PX = 40;
const NO_RATE = "—";

type PathStepRow = PathStep & {
  id: string;
  bounceRate: number | undefined;
  exitRate: number | undefined;
};

const getRate = (count: number, total: number) =>
  total > 0 ? count / total : undefined;

const toRow = (step: PathStep): PathStepRow => ({
  ...step,
  id: step.name,
  bounceRate: getRate(step.bounces, step.entrances),
  exitRate: getRate(step.exits, step.visits),
});

const formatCount = (value: number) => formatNumber(value);

const formatRate = (rate: number) =>
  formatNumber(rate, { number_style: "percent", maximumFractionDigits: 1 });

type RateCellProps = {
  rate: number | undefined;
  description: string;
};

const RateCell = ({ rate, description }: RateCellProps) =>
  rate === undefined ? (
    <Text c="text-tertiary">{NO_RATE}</Text>
  ) : (
    <Tooltip label={description}>
      <Text>{formatRate(rate)}</Text>
    </Tooltip>
  );

const ENTRANCE_COLUMN_IDS = ["entrances"];
const BOUNCE_COLUMN_IDS = ["bounce_rate"];
const EXIT_COLUMN_IDS = ["exit_rate"];

const getColumns = (): TreeTableColumnDef<PathStepRow>[] => [
  {
    id: "name",
    header: t`Step`,
    minWidth: "auto",
    maxAutoWidth: 400,
    enableSorting: true,
    accessorFn: (row) => row.name,
    cell: ({ row }) => <Ellipsified>{row.original.name}</Ellipsified>,
  },
  {
    id: "entrances",
    header: t`Entrances`,
    width: 120,
    enableSorting: true,
    sortDescFirst: true,
    accessorFn: (row) => row.entrances,
    cell: ({ row }) => formatCount(row.original.entrances),
  },
  {
    id: "bounce_rate",
    header: t`Bounce rate`,
    width: 120,
    enableSorting: true,
    sortDescFirst: true,
    sortUndefined: "last",
    accessorFn: (row) => row.bounceRate,
    cell: ({ row }) => (
      <RateCell
        rate={row.original.bounceRate}
        description={t`${formatCount(row.original.bounces)} of ${formatCount(row.original.entrances)} visits that started here had no other step`}
      />
    ),
  },
  {
    id: "visits",
    header: t`Visits`,
    width: 120,
    enableSorting: true,
    sortDescFirst: true,
    accessorFn: (row) => row.visits,
    cell: ({ row }) => formatCount(row.original.visits),
  },
  {
    id: "exit_rate",
    header: t`Exit rate`,
    width: 120,
    enableSorting: true,
    sortDescFirst: true,
    sortUndefined: "last",
    accessorFn: (row) => row.exitRate,
    cell: ({ row }) => (
      <RateCell
        rate={row.original.exitRate}
        description={t`${formatCount(row.original.exits)} of ${formatCount(row.original.visits)} visits that reached this step ended here`}
      />
    ),
  },
];

type PathStepsPanelProps = {
  steps: PathSteps;
};

/**
 * Each step in the paths, wherever it appears in them: how many visits
 * started and ended there, counted in visits.
 */
export const PathStepsPanel = ({ steps }: PathStepsPanelProps) => (
  <SupportingPanel title={t`Steps`} warnings={steps.warnings}>
    <PathStepsBody steps={steps} />
  </SupportingPanel>
);

const PathStepsBody = ({ steps }: PathStepsPanelProps) => {
  if (steps.error !== undefined) {
    return <Alert color="error">{steps.error}</Alert>;
  }
  if (steps.isLoading || steps.steps === undefined) {
    return (
      <Box ta="center" py="xl">
        <Loader />
      </Box>
    );
  }
  if (steps.steps.length === 0) {
    return <Text c="text-secondary">{t`No visits in this range.`}</Text>;
  }
  return (
    <PathStepsTable
      steps={steps.steps}
      showsEntrances={steps.showsEntrances}
      showsBounces={steps.showsBounces}
      showsExits={steps.showsExits}
    />
  );
};

type PathStepsTableProps = {
  steps: PathStep[];
  showsEntrances: boolean;
  showsBounces: boolean;
  showsExits: boolean;
};

const PathStepsTable = ({
  steps,
  showsEntrances,
  showsBounces,
  showsExits,
}: PathStepsTableProps) => {
  const data = useMemo(() => steps.map(toRow), [steps]);
  const columns = useMemo(() => {
    const hidden = [
      ...(showsEntrances ? [] : ENTRANCE_COLUMN_IDS),
      ...(showsBounces ? [] : BOUNCE_COLUMN_IDS),
      ...(showsExits ? [] : EXIT_COLUMN_IDS),
    ];
    return getColumns().filter((column) => !hidden.includes(column.id));
  }, [showsEntrances, showsBounces, showsExits]);
  const instance = useTreeTableInstance<PathStepRow>({
    data,
    columns,
    getNodeId: (row) => row.id,
    defaultRowHeight: ROW_HEIGHT_PX,
  });

  return (
    <TreeTable
      instance={instance}
      hierarchical={false}
      headerVariant="pill"
      ariaLabel={t`Steps`}
      styles={{ body: { maxHeight: TABLE_MAX_HEIGHT_PX } }}
    />
  );
};
