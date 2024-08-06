import cx from "classnames";
import { useCallback, useMemo } from "react";
import { connect } from "react-redux";
import { useAsyncFn } from "react-use";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { editQuestion } from "metabase/dashboard/actions";
import { getParameterValuesBySlugMap } from "metabase/dashboard/selectors";
import { useStore } from "metabase/lib/redux";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import QueryDownloadPopover from "metabase/query_builder/components/QueryDownloadPopover";
import type { DownloadQueryResultsOpts } from "metabase/redux/downloads";
import { downloadQueryResults } from "metabase/redux/downloads";
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

import { CardMenuRoot } from "./DashCardMenu.styled";

interface OwnProps {
  question: Question;
  result: Dataset;
  dashboardId?: DashboardId;
  dashcardId?: DashCardId;
  uuid?: string;
  token?: string;
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
  onEditQuestion,
  onDownloadResults,
}: DashCardMenuProps) => {
  const store = useStore();

  const [{ loading }, handleDownload] = useAsyncFn(
    async (opts: { type: string; enableFormatting: boolean }) => {
      const params = getParameterValuesBySlugMap(store.getState());

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
    [store, question, result, dashboardId, dashcardId, uuid, token],
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
  result?: Dataset;
  isXray?: boolean;
  isEmbed: boolean;
  /** If public sharing or static/public embed */
  isPublicOrEmbedded?: boolean;
  isEditing: boolean;
}

const canEditQuestion = (question: Question) => {
  if (!question.canWrite()) {
    return false;
  }

  const { isEditable } = Lib.queryDisplayInfo(question.query());
  return isEditable;
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
  isPublicOrEmbedded,
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
    !isPublicOrEmbedded &&
    !isEditing &&
    !isXray &&
    (canEditQuestion(question) || canDownloadResults(result))
  );
};

export const DashCardMenuConnected = connect(
  null,
  mapDispatchToProps,
)(DashCardMenu);
