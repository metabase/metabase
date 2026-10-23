import { useState } from "react";
import { useAsync } from "react-use";
import { t } from "ttag";

import { useCreateCardMutation } from "metabase/api";
import { SaveQuestionModal } from "metabase/common/components/SaveQuestionModal";
import { useToast } from "metabase/common/hooks";
import { useNavigate } from "metabase/router";
import {
  Alert,
  Box,
  Button,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import Visualization from "metabase/visualizations/components/Visualization";
import type { ClickActionsMode } from "metabase/visualizations/types";
import Question from "metabase-lib/v1/Question";
import type { DashboardTabId, DatasetQuery } from "metabase-types/api";

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

/**
 * A table of the actors in a clicked part of the chart, which can be saved
 * as a question.
 */
export const MembersModal = ({
  drill,
  queries,
  onClose,
}: MembersModalProps) => {
  const state = useAsync(() => queries.fetchMembersTable(drill.point), [drill]);
  const count = state.value?.count ?? drill.count;
  const rowCount = state.value?.dataset.data.rows.length ?? 0;
  const [isSaving, setIsSaving] = useState(false);

  return (
    <>
      <Modal.Root opened size="80rem" padding="xl" onClose={onClose}>
        <Modal.Overlay />
        <Modal.Content>
          <Modal.Header>
            <Modal.Title>{drill.label}</Modal.Title>
            <Group gap="sm" wrap="nowrap">
              <Button
                variant="filled"
                disabled={state.value === undefined}
                onClick={() => setIsSaving(true)}
              >
                {t`Save this list`}
              </Button>
              <Modal.CloseButton />
            </Group>
          </Modal.Header>
          <Modal.Body>
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
                {state.error && (
                  <Alert color="error">{state.error.message}</Alert>
                )}
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
          </Modal.Body>
        </Modal.Content>
      </Modal.Root>
      {isSaving && state.value !== undefined && (
        <SaveListModal
          name={drill.label}
          query={state.value.query}
          onClose={() => setIsSaving(false)}
        />
      )}
    </>
  );
};

type SaveListModalProps = {
  name: string;
  query: DatasetQuery;
  onClose: () => void;
};

/**
 * The query builder's save modal, for the list as shown: the same query, so
 * the saved question lists the same columns. It reruns the analysis's
 * query, so with a relative date range the list follows it.
 */
const SaveListModal = ({ name, query, onClose }: SaveListModalProps) => {
  const [createCard] = useCreateCardMutation();
  const [sendToast] = useToast();
  const navigate = useNavigate();
  const [question] = useState(
    () =>
      new Question({
        name,
        display: "table",
        visualization_settings: {},
        dataset_query: query,
      }),
  );

  const handleCreate = async (
    toSave: Question,
    options?: { dashboardTabId?: DashboardTabId },
  ) => {
    const {
      name,
      description,
      display,
      dataset_query,
      visualization_settings,
      collection_id,
      dashboard_id,
    } = toSave.card();
    const created = await createCard({
      name,
      description,
      type: "question",
      display,
      dataset_query,
      visualization_settings,
      ...(dashboard_id != null
        ? { dashboard_id, dashboard_tab_id: options?.dashboardTabId }
        : { collection_id }),
    }).unwrap();
    const saved = toSave.setId(created.id);
    sendToast({
      icon: "check",
      message: t`Saved “${created.name}”`,
      actionLabel: t`Open`,
      action: () => navigate(Urls.question(saved)),
    });
    return saved;
  };

  return (
    <SaveQuestionModal
      opened
      question={question}
      originalQuestion={null}
      onCreate={handleCreate}
      // There's no original to replace.
      onSave={async () => undefined}
      onClose={onClose}
      closeOnSuccess
    />
  );
};
