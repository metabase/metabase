import { useCallback, useMemo } from "react";
import { connect } from "react-redux";
import { useAsyncFn } from "react-use";
import { t } from "ttag";

import { editQuestion } from "metabase/dashboard/actions";
import { isQuestionDashCard } from "metabase/dashboard/utils";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import type { DownloadQueryResultsOpts } from "metabase/query_builder/actions";
import { downloadQueryResults } from "metabase/query_builder/actions";
import QueryDownloadPopover from "metabase/query_builder/components/QueryDownloadPopover";
import { Icon } from "metabase/ui";
import { SAVING_DOM_IMAGE_HIDDEN_CLASS } from "metabase/visualizations/lib/save-chart-image";
import { saveDashcardPdf } from "metabase/visualizations/lib/save-dashcard-pdf";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/Question";
import InternalQuery from "metabase-lib/queries/InternalQuery";
import type {
  DashboardCard,
  DashboardId,
  Dataset,
  VisualizationSettings,
} from "metabase-types/api";

import { CardMenuRoot } from "./DashCardMenu.styled";

interface OwnProps {
  question: Question;
  result: Dataset;
  dashboardId?: DashboardId;
  dashcard?: DashboardCard;
  uuid?: string;
  token?: string;
  params?: Record<string, unknown>;
  visualizationSettings?: VisualizationSettings;
}

interface TriggerProps {
  open: boolean;
  onClick: () => void;
}

interface DispatchProps {
  onEditQuestion: (question: Question) => void;
  onDownloadResults: (opts: DownloadQueryResultsOpts) => void;
}

type DashCardMenuProps = OwnProps & DispatchProps;

const mapDispatchToProps: DispatchProps = {
  onEditQuestion: editQuestion,
  onDownloadResults: downloadQueryResults,
};

const DashCardMenu = ({
  question,
  result,
  dashboardId,
  dashcard,
  uuid,
  token,
  params,
  onEditQuestion,
  onDownloadResults,
}: DashCardMenuProps) => {
  const [{ loading }, handleDownload] = useAsyncFn(
    async (type: string) => {
      await onDownloadResults({
        type,
        question,
        result,
        dashboardId,
        dashcardId: dashcard?.id,
        uuid,
        token,
        params,
      });
    },
    [question, result, dashboardId, dashcard, uuid, token, params],
  );

  const handleExportAsPDF = useCallback(() => {
    const selector = `#DashCard-${dashcard?.id}`;
    const name = question.displayName() || "Dashcard";
    saveDashcardPdf(selector, name);
  }, [dashcard, question]);

  const handleMenuContent = useCallback(
    (toggleMenu: () => void) => (
      <QueryDownloadPopover
        question={question}
        result={result}
        onDownload={type => {
          toggleMenu();
          handleDownload(type);
        }}
      />
    ),
    [question, result, handleDownload],
  );

  const menuItems = useMemo(
    () => [
      canEditQuestion(question) && {
        title: t`Edit question`,
        icon: "pencil",
        action: () => onEditQuestion(question),
      },
      dashcard &&
        isQuestionDashCard(dashcard) && {
          title: t`Export as PDF`,
          icon: "document",
          action: handleExportAsPDF,
        },
      canDownloadResults(result) && {
        title: loading ? t`Downloading…` : t`Download results`,
        icon: "download",
        disabled: loading,
        content: handleMenuContent,
      },
    ],
    [
      question,
      dashcard,
      result,
      loading,
      handleExportAsPDF,
      handleMenuContent,
      onEditQuestion,
    ],
  );

  return (
    <CardMenuRoot
      className={SAVING_DOM_IMAGE_HIDDEN_CLASS}
      items={menuItems}
      renderTrigger={({ open, onClick }: TriggerProps) => (
        <Icon
          name="ellipsis"
          className={!open ? "hover-child hover-child--smooth" : undefined}
          data-testid="dashcard-menu"
          onClick={onClick}
        />
      )}
    />
  );
};

interface QueryDownloadWidgetOpts {
  question: Question;
  result?: Dataset;
  isXray?: boolean;
  isEmbed: boolean;
  isPublic?: boolean;
  isEditing: boolean;
}

const canEditQuestion = (question: Question) => {
  const { isEditable } = Lib.queryDisplayInfo(question.query());
  return question.canWrite() && isEditable;
};

const canDownloadResults = (result?: Dataset) => {
  return (
    result != null &&
    !result.error &&
    PLUGIN_FEATURE_LEVEL_PERMISSIONS.canDownloadResults(result)
  );
};

DashCardMenu.shouldRender = ({
  question,
  result,
  isXray,
  isEmbed,
  isPublic,
  isEditing,
}: QueryDownloadWidgetOpts) => {
  // Do not remove this check until we completely remove the old code related to Audit V1!
  // MLv2 doesn't handle `internal` queries used for Audit V1.
  const isInternalQuery = InternalQuery.isDatasetQueryType(
    question.datasetQuery(),
  );

  if (isEmbed) {
    return isEmbed;
  }
  return (
    !isInternalQuery &&
    !isPublic &&
    !isEditing &&
    !isXray &&
    (canEditQuestion(question) || canDownloadResults(result))
  );
};

export const DashCardMenuConnected = connect(
  null,
  mapDispatchToProps,
)(DashCardMenu);
