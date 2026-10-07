import { useState } from "react";
import { P, match } from "ts-pattern";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { SaveQuestionModal } from "metabase/common/components/SaveQuestionModal";
import { markChartSaved } from "metabase/metabot/state";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import { useNavigate } from "metabase/router";
import { Button, Icon } from "metabase/ui";
import * as Urls from "metabase/urls";
import type Question from "metabase-lib/v1/Question";
import type { DashboardTabId } from "metabase-types/api";

import { useSaveMetabotEntityMutation } from "../../../api";

export function SaveChartAction({
  conversationId,
  chartId,
  savedCardId,
  question,
  readonly,
}: {
  conversationId: string;
  chartId: string;
  savedCardId: number | undefined;
  question: Question;
  readonly: boolean;
}) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [saveMetabotEntity] = useSaveMetabotEntityMutation();
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);

  const handleCreate = async (
    newQuestion: Question,
    options?: { dashboardTabId?: DashboardTabId },
  ) => {
    const created = await saveMetabotEntity({
      conversation_id: conversationId,
      chart_id: chartId,
      card: {
        ...newQuestion.card(),
        dashboard_tab_id: options?.dashboardTabId,
      },
    }).unwrap();
    const savedQuestion = newQuestion.setId(created.id);
    dispatch(markChartSaved({ entityId: chartId, cardId: created.id }));
    dispatch(
      addUndo({
        icon: "check_filled",
        message: t`Saved`,
        extraAction: {
          label: t`View`,
          action: () => navigate(Urls.question(savedQuestion)),
        },
      }),
    );
    return savedQuestion;
  };

  return (
    <>
      {match({ savedCardId, readonly })
        .with({ savedCardId: P.number }, ({ savedCardId }) => (
          <Button
            component={ForwardRefLink}
            to={Urls.question(question.setId(savedCardId))}
            target="_blank"
            variant="transparent"
            size="compact-md"
            leftSection={<Icon name="check" size={14} />}
          >
            {t`Saved`}
          </Button>
        ))
        .with({ readonly: true }, () => null)
        .with({ savedCardId: P.nullish, readonly: false }, () => (
          <Button
            variant="transparent"
            size="compact-md"
            onClick={() => setIsSaveModalOpen(true)}
          >
            {t`Save`}
          </Button>
        ))
        .exhaustive()}
      {isSaveModalOpen && (
        <SaveQuestionModal
          opened
          question={question}
          originalQuestion={null}
          onCreate={handleCreate}
          onSave={async () => undefined}
          onClose={() => setIsSaveModalOpen(false)}
          closeOnSuccess
        />
      )}
    </>
  );
}
