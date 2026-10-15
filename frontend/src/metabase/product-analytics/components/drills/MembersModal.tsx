import { useAsync } from "react-use";
import { t } from "ttag";

import { Alert, Box, Group, Loader, Modal, Stack, Text } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import type { ClickActionsMode } from "metabase/visualizations/types";

import type { ChartDrill } from "../../drills/types";
import type { DrillQueries } from "../../drills/use-drill-queries";
import { getCountLabel } from "../FilterPills";

const SYNTHETIC_CARD_ID = -1;

const NO_CLICK_ACTIONS: ClickActionsMode = { actionsForClick: () => [] };

type MembersModalProps = {
  drill: ChartDrill;
  queries: DrillQueries;
  onClose: () => void;
};

/** A table of the actors in a clicked part of the chart. */
export const MembersModal = ({
  drill,
  queries,
  onClose,
}: MembersModalProps) => {
  const state = useAsync(() => queries.fetchMembersTable(drill.point), [drill]);
  const count = state.value?.count ?? drill.count;
  const rowCount = state.value?.dataset.data.rows.length ?? 0;

  return (
    <Modal
      opened
      size="80rem"
      title={drill.label}
      onClose={onClose}
      padding="xl"
    >
      <Stack gap="md">
        {count !== null && (
          <Text c="text-secondary">
            {getCountLabel(queries.grain, count)}
            {rowCount < count &&
              rowCount > 0 &&
              t` (showing ${rowCount.toLocaleString()})`}
          </Text>
        )}
        <Box h="60vh" pos="relative">
          {state.loading && (
            <Group justify="center" h="100%">
              <Loader />
            </Group>
          )}
          {state.error && <Alert color="error">{state.error.message}</Alert>}
          {state.value && (
            <Visualization
              rawSeries={[
                {
                  card: {
                    id: SYNTHETIC_CARD_ID,
                    name: drill.label,
                    display: "table",
                    visualization_settings: {},
                    dataset_query: state.value.query,
                  },
                  data: state.value.dataset.data,
                },
              ]}
              isQueryBuilder={false}
              mode={NO_CLICK_ACTIONS}
            />
          )}
        </Box>
      </Stack>
    </Modal>
  );
};
