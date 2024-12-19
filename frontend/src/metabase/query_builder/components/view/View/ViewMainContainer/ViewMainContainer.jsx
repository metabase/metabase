/* eslint-disable react/prop-types */
import cx from "classnames";

import DebouncedFrame from "metabase/components/DebouncedFrame";
import CS from "metabase/css/core/index.css";
import QueryVisualization from "metabase/query_builder/components/QueryVisualization";
import { SyncedParametersList } from "metabase/query_builder/components/SyncedParametersList";
import { TimeseriesChrome } from "metabase/querying/filters/components/TimeseriesChrome";
import { Box } from "metabase/ui";
import * as Lib from "metabase-lib";

import { ViewFooter } from "../../ViewFooter";
import { ViewNativeQueryEditor } from "../ViewNativeQueryEditor";

import ViewMainContainerS from "./ViewMainContainer.module.css";

export const ViewMainContainer = props => {
  const {
    queryBuilderMode,
    mode,
    question,
    showLeftSidebar,
    showRightSidebar,
    parameters,
    setParameterValue,
    isLiveResizable,
    updateQuestion,
  } = props;

  if (queryBuilderMode === "notebook") {
    // we need to render main only in view mode
    return;
  }

  const queryMode = mode && mode.queryMode();
  const { isNative } = Lib.queryDisplayInfo(question.query());
  const isSidebarOpen = showLeftSidebar || showRightSidebar;

  return (
    <Box
      component="main"
      className={cx(ViewMainContainerS.QueryBuilderMain, {
        [ViewMainContainerS.isSidebarOpen]: isSidebarOpen,
      })}
      data-testid="query-builder-main"
    >
      {isNative ? (
        <ViewNativeQueryEditor {...props} />
      ) : (
        <SyncedParametersList
          className={ViewMainContainerS.StyledSyncedParametersList}
          parameters={parameters}
          setParameterValue={setParameterValue}
          commitImmediately
        />
      )}

      <DebouncedFrame
        className={ViewMainContainerS.StyledDebouncedFrame}
        enabled={!isLiveResizable}
      >
        <QueryVisualization
          {...props}
          noHeader
          className={CS.spread}
          mode={queryMode}
          onUpdateQuestion={updateQuestion}
        />
      </DebouncedFrame>
      <TimeseriesChrome
        question={question}
        updateQuestion={updateQuestion}
        className={CS.flexNoShrink}
      />
      <ViewFooter className={CS.flexNoShrink} />
    </Box>
  );
};
