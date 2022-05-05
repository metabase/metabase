import React, { useState } from "react";
import PropTypes from "prop-types";

import QuestionDetailsSidebarPanel from "metabase/query_builder/components/view/sidebars/QuestionDetailsSidebarPanel";
import { SIDEBAR_VIEWS } from "./constants";

QuestionDetailsSidebar.propTypes = {
  question: PropTypes.object.isRequired,
  onOpenModal: PropTypes.func.isRequired,
  isBookmarked: PropTypes.bool.isRequired,
  toggleBookmark: PropTypes.func.isRequired,
  persistDataset: PropTypes.func.isRequired,
  unpersistDataset: PropTypes.func.isRequired,
};

function QuestionDetailsSidebar({
  question,
  onOpenModal,
  isBookmarked,
  toggleBookmark,
  persistDataset,
  unpersistDataset,
}) {
  const [view, setView] = useState(view);

  switch (view) {
    case SIDEBAR_VIEWS.DETAILS:
    default:
      return (
        <QuestionDetailsSidebarPanel
          setView={setView}
          question={question}
          onOpenModal={onOpenModal}
          isBookmarked={isBookmarked}
          toggleBookmark={toggleBookmark}
          persistDataset={persistDataset}
          unpersistDataset={unpersistDataset}
        />
      );
  }
}

export default QuestionDetailsSidebar;
