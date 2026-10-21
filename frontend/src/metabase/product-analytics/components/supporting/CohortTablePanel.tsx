import { t } from "ttag";
import { noop } from "underscore";

import { Alert, Box, Loader, Text } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";

import type { CohortsSupport } from "../../supporting/use-supporting-analyses";

import { NO_CLICK_ACTIONS, SupportingPanel } from "./SupportingPanel";

const CHART_HEIGHT_PX = 400;

type CohortTablePanelProps = {
  cohorts: CohortsSupport;
};

/** A row per cohort, with a column per period since the cohort started. */
export const CohortTablePanel = ({ cohorts }: CohortTablePanelProps) => (
  <SupportingPanel title={t`Retention by cohort`}>
    <CohortTableBody cohorts={cohorts} />
  </SupportingPanel>
);

const CohortTableBody = ({ cohorts }: CohortTablePanelProps) => {
  if (cohorts.error !== undefined) {
    return <Alert color="error">{cohorts.error}</Alert>;
  }
  if (cohorts.isLoading || cohorts.series === undefined) {
    return (
      <Box ta="center" py="xl">
        <Loader />
      </Box>
    );
  }
  if (cohorts.series.data.rows.length === 0) {
    return <Text c="text-secondary">{t`No one started in this range.`}</Text>;
  }
  return (
    <Box h={CHART_HEIGHT_PX}>
      <Visualization
        rawSeries={[cohorts.series]}
        isQueryBuilder={false}
        mode={NO_CLICK_ACTIONS}
        onChangeCardAndRun={noop}
      />
    </Box>
  );
};
