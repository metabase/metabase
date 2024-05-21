import cx from "classnames";
import { useCallback, useMemo } from "react";
import { connect } from "react-redux";
import { useAsyncFn } from "react-use";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { editQuestion } from "metabase/dashboard/actions";
import { getIsLoadingComplete } from "metabase/dashboard/selectors";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import type { DownloadQueryResultsOpts } from "metabase/query_builder/actions";
import { downloadQueryResults } from "metabase/query_builder/actions";
import QueryDownloadPopover from "metabase/query_builder/components/QueryDownloadPopover";
import { Icon } from "metabase/ui";
import { SAVING_DOM_IMAGE_HIDDEN_CLASS } from "metabase/visualizations/lib/save-chart-image";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import InternalQuery from "metabase-lib/v1/queries/InternalQuery";
import type {
  DashboardId,
  DashCardId,
  Dataset,
  VisualizationSettings,
} from "metabase-types/api";
import type { State } from "metabase-types/store";

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

interface StateProps {
  isLoadingComplete: boolean;
}

interface DispatchProps {
  onEditQuestion: (question: Question) => void;
  onDownloadResults: (opts: DownloadQueryResultsOpts) => void;
}

type DashCardMenuProps = OwnProps & StateProps & DispatchProps;

const mapStateToProps = (state: State): StateProps => ({
  isLoadingComplete: getIsLoadingComplete(state),
});

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
  isLoadingComplete,
  onEditQuestion,
  onDownloadResults,
}: DashCardMenuProps) => {
  const [{ loading }, handleDownload] = useAsyncFn(
    async (opts: { type: string; enableFormatting: boolean }) => {
      await onDownloadResults({
        ...opts,
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
        onDownload={opts => {
          toggleMenu();
          handleDownload(opts);
        }}
      />
    ),
    [question, result, handleDownload],
  );

  const menuItems = useMemo(() => {
    const items = [];
    if (isLoadingComplete && canEditQuestion(question)) {
      items.push({
        title: `Edit question`,
        icon: "pencil",
        action: () => onEditQuestion(question),
      });
    }
    if (canDownloadResults(result)) {
      items.push({
        title: loading ? t`Downloading…` : t`Download results`,
        icon: "download",
        disabled: loading,
        content: handleMenuContent,
      });
    }
    return items;
  }, [
    question,
    result,
    loading,
    isLoadingComplete,
    handleMenuContent,
    onEditQuestion,
  ]);

  return (
    <CardMenuRoot
      className={SAVING_DOM_IMAGE_HIDDEN_CLASS}
      items={menuItems}
      renderTrigger={({ open, onClick }: TriggerProps) => (
        <Icon
          name="ellipsis"
          className={!open ? cx(CS.hoverChild, CS.hoverChildSmooth) : undefined}
          data-testid="dashcard-menu"
          onClick={onClick}
        />
      )}
    />
  );
};

interface QueryDownloadWidgetOpts {
  question: Question;
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
  return !isInternalQuery && !isPublic && !isEditing && !isXray;
};

export const DashCardMenuConnected = connect(
  mapStateToProps,
  mapDispatchToProps,
)(DashCardMenu);
