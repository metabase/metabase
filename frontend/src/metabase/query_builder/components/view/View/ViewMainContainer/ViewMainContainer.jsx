/* eslint-disable react/prop-types */
import CS from "metabase/css/core/index.css";
import QueryVisualization from "metabase/query_builder/components/QueryVisualization";
import {
  QueryBuilderMain,
  StyledDebouncedFrame,
  StyledSyncedParametersList,
} from "metabase/query_builder/components/view/View/View.styled";
import { ViewNativeQueryEditor } from "metabase/query_builder/components/view/View/ViewNativeQueryEditor/ViewNativeQueryEditor";
import { ViewFooter } from "metabase/query_builder/components/view/ViewFooter";
import { TimeseriesChrome } from "metabase/querying/filters/components/TimeseriesChrome";
import * as Lib from "metabase-lib";

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
    <QueryBuilderMain
      isSidebarOpen={isSidebarOpen}
      data-testid="query-builder-main"
    >
      {isNative ? (
        <ViewNativeQueryEditor {...props} />
      ) : (
        <StyledSyncedParametersList
          parameters={parameters}
          setParameterValue={setParameterValue}
          commitImmediately
        />
      )}

      <StyledDebouncedFrame enabled={!isLiveResizable}>
        <QueryVisualization
          {...props}
          noHeader
          className={CS.spread}
          mode={queryMode}
        />
      </StyledDebouncedFrame>
      <TimeseriesChrome
        question={question}
        updateQuestion={updateQuestion}
        className={CS.flexNoShrink}
      />
      <ViewFooter className={CS.flexNoShrink} />
    </QueryBuilderMain>
  );
};
