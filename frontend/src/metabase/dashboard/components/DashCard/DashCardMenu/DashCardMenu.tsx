import React, { useCallback, useMemo } from "react";
import { connect } from "react-redux";
import { useAsyncFn } from "react-use";
import { t } from "ttag";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import * as Urls from "metabase/lib/urls";
import {
  downloadQueryResults,
  DownloadQueryResultsOpts,
} from "metabase/query_builder/actions";
import QueryDownloadPopover from "metabase/query_builder/components/QueryDownloadPopover";
import {
  DashboardId,
  DashCardId,
  Dataset,
  VisualizationSettings,
} from "metabase-types/api";
import Question from "metabase-lib/Question";
import { CardMenuRoot } from "./DashCardMenu.styled";

interface OwnProps {
  className?: string;
  question: Question;
  result: Dataset;
  dashboardId?: DashboardId;
  dashcardId?: DashCardId;
  uuid?: string;
  token?: string;
  params?: Record<string, unknown>;
  visualizationSettings?: VisualizationSettings;
}

interface DispatchProps {
  onDownload: (opts: DownloadQueryResultsOpts) => void;
}

type DashCardMenuProps = OwnProps & DispatchProps;

const mapDispatchToProps: DispatchProps = {
  onDownload: downloadQueryResults,
};

const DashCardMenu = ({
  className,
  question,
  result,
  dashboardId,
  dashcardId,
  uuid,
  token,
  params,
  onDownload,
}: DashCardMenuProps) => {
  const [{ loading }, handleDownload] = useAsyncFn(
    async (type: string) => {
      await onDownload({
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
        link: Urls.question(question.card()),
      },
      canDownloadResults(result) && {
        title: t`Download results`,
        disabled: loading,
        content: handleMenuContent,
      },
    ],
    [question, result, loading, handleMenuContent],
  );

  return (
    <CardMenuRoot
      className={className}
      items={menuItems}
      triggerIcon="ellipsis"
    />
  );
};

interface QueryDownloadWidgetOpts {
  question: Question;
  result?: Dataset;
}

const canEditQuestion = (question: Question) => {
  return question.query().isEditable();
};

const canDownloadResults = (result?: Dataset) => {
  return (
    result != null &&
    !result.error &&
    PLUGIN_FEATURE_LEVEL_PERMISSIONS.canDownloadResults(result)
  );
};

DashCardMenu.shouldRender = ({ question, result }: QueryDownloadWidgetOpts) => {
  return canEditQuestion(question) || canDownloadResults(result);
};

export default connect(null, mapDispatchToProps)(DashCardMenu);
