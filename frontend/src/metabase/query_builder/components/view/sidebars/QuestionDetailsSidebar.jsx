import React, { useState } from "react";
import PropTypes from "prop-types";

import QuestionDetailsSidebarPanel from "metabase/query_builder/components/view/sidebars/QuestionDetailsSidebarPanel";
import { SIDEBAR_VIEWS } from "./constants";

QuestionDetailsSidebar.propTypes = {
  isBookmarked: PropTypes.bool.isRequired,
  question: PropTypes.object.isRequired,
  onOpenModal: PropTypes.func.isRequired,
  setBookmarked: PropTypes.func.isRequired,
};

function QuestionDetailsSidebar({
  isBookmarked,
  question,
  onOpenModal,
  setBookmarked,
}) {
  const [view, setView] = useState(view);

  switch (view) {
    case SIDEBAR_VIEWS.DETAILS:
    default:
      return (
        <QuestionDetailsSidebarPanel
          isBookmarked={isBookmarked}
          setView={setView}
          question={question}
          onOpenModal={onOpenModal}
          setBookmarked={setBookmarked}
        />
      );
  }
}

export default QuestionDetailsSidebar;
