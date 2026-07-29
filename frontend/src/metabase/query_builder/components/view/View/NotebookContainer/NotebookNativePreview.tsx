import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { skipToken, useGetCardDashboardsQuery } from "metabase/api";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { updateQuestion } from "metabase/query_builder/actions";
import { getQuestion } from "metabase/query_builder/selectors";
import { NotebookNativePreview as ControlledNotebookNativePreview } from "metabase/querying/notebook/components/NotebookNativePreview";
import { useDispatch, useSelector } from "metabase/redux";
import { setUIControls } from "metabase/redux/query-builder";
import { checkNotNull } from "metabase/utils/types";
import type Question from "metabase-lib/v1/Question";

export const NotebookNativePreview = () => {
  const dispatch = useDispatch();
  const question = checkNotNull(useSelector(getQuestion));
  const cardId = question.id();
  const isCardEmbedded = question.card().enable_embedding === true;

  const { data: dashboards, isLoading: isLoadingDashboards } =
    useGetCardDashboardsQuery(cardId != null ? { id: cardId } : skipToken);

  const isInEmbeddedDashboard = useMemo(
    () => (dashboards ?? []).some((dashboard) => dashboard.enable_embedding),
    [dashboards],
  );

  const shouldWarn = isCardEmbedded || isInEmbeddedDashboard;

  const [pendingQuestion, setPendingQuestion] = useState<Question | null>(null);

  const performConvert = useCallback(
    (newQuestion: Question) => {
      dispatch(
        updateQuestion(newQuestion, { shouldUpdateUrl: true, run: true }),
      );
      dispatch(setUIControls({ isNativeEditorOpen: true }));
    },
    [dispatch],
  );

  const handleConvertClick = useCallback(
    (newQuestion: Question) => {
      if (shouldWarn) {
        setPendingQuestion(newQuestion);
      } else {
        performConvert(newQuestion);
      }
    },
    [shouldWarn, performConvert],
  );

  const handleConfirm = useCallback(() => {
    if (pendingQuestion) {
      performConvert(pendingQuestion);
      setPendingQuestion(null);
    }
  }, [pendingQuestion, performConvert]);

  const handleClose = useCallback(() => {
    setPendingQuestion(null);
  }, []);

  return (
    <>
      <ControlledNotebookNativePreview
        question={question}
        onConvertClick={handleConvertClick}
        disableConvert={isLoadingDashboards}
      />
      {pendingQuestion && (
        <ConfirmModal
          opened
          data-testid="convert-to-native-warning-modal"
          title={t`Converting this question to SQL will break any dashboard filters connected to its columns`}
          message={t`This question is part of an embedded dashboard. Converting the query to SQL will break any dashboard filters that map to its columns, since the conversion won't include SQL variables for the filters to connect to. You can, however, manually add those variables to the converted SQL, then connect the dashboard filters to those variables.`}
          confirmButtonText={t`Convert to SQL`}
          confirmButtonProps={{ color: "core-brand", variant: "filled" }}
          onConfirm={handleConfirm}
          onClose={handleClose}
        />
      )}
    </>
  );
};
