/* eslint-disable react/prop-types */
import CS from "metabase/css/core/index.css";
import QueryVisualization from "metabase/query_builder/components/QueryVisualization";
import { TimeseriesChrome } from "metabase/querying/filters/components/TimeseriesChrome";
import * as Lib from "metabase-lib";

import { ViewFooter } from "../../ViewFooter";
import { ViewNativeQueryEditor } from "../ViewNativeQueryEditor";

import {
  QueryBuilderMain,
  StyledDebouncedFrame,
  StyledSyncedParametersList,
} from "./ViewMainContainer.styled";

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
          onUpdateQuestion={updateQuestion}
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
