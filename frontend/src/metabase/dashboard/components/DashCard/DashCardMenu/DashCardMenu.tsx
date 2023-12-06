import { useCallback, useMemo } from "react";
import { connect } from "react-redux";
import { useAsyncFn } from "react-use";
import { t } from "ttag";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { Icon } from "metabase/core/components/Icon";
import type { DownloadQueryResultsOpts } from "metabase/query_builder/actions";
import { downloadQueryResults } from "metabase/query_builder/actions";
import QueryDownloadPopover from "metabase/query_builder/components/QueryDownloadPopover";
import { editQuestion } from "metabase/dashboard/actions";
import { SAVING_DOM_IMAGE_HIDDEN_CLASS } from "metabase/visualizations/lib/save-chart-image";
import type {
  DashboardId,
  DashCardId,
  Dataset,
  VisualizationSettings,
} from "metabase-types/api";
import type Question from "metabase-lib/Question";
import InternalQuery from "metabase-lib/queries/InternalQuery";
import { CardMenuRoot } from "./DashCardMenu.styled";

interface OwnProps {
  question: Question;
  result: Dataset;
  dashboardId?: DashboardId;
  dashcardId?: DashCardId;
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
  dashcardId,
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
        dashcardId,
        uuid,
        token,
        params,
      });
    },
    [question, result, dashboardId, dashcardId, uuid, token, params],
  );

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
        title: `Edit question`,
        icon: "pencil",
        action: () => onEditQuestion(question),
      },
      canDownloadResults(result) && {
        title: loading ? t`Downloading…` : t`Download results`,
        icon: "download",
        disabled: loading,
        content: handleMenuContent,
      },
    ],
    [question, result, loading, handleMenuContent, onEditQuestion],
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
  return (
    question.canWrite() &&
    question.query() != null &&
    question.query().isEditable()
  );
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
  const isInternalQuery = question.query() instanceof InternalQuery;
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
