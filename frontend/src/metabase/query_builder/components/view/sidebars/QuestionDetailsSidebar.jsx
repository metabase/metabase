import React, { useState } from "react";
import QuestionDetailsSidebarPanel from "metabase/query_builder/components/view/sidebars/QuestionDetailsSidebarPanel";
import { PLUGIN_MODERATION_COMPONENTS } from "metabase/plugins";
import { SIDEBAR_VIEWS } from "./constants";
const { CreateModerationIssuePanel } = PLUGIN_MODERATION_COMPONENTS;

function QuestionDetailsSidebar(props) {
  const [view, setView] = useState({
    name: undefined,
    props: undefined,
  });
  const { name, props: viewProps } = view;

  switch (name) {
    case SIDEBAR_VIEWS.CREATE_ISSUE_PANEL:
      return (
        <CreateModerationIssuePanel
          {...viewProps}
          onCancel={() => setView({ name: SIDEBAR_VIEWS.DETAILS })}
        />
      );
    case SIDEBAR_VIEWS.DETAILS:
    default:
      return <QuestionDetailsSidebarPanel setView={setView} {...props} />;
  }
}

export default QuestionDetailsSidebar;
