import React, { useState } from "react";
import PropTypes from "prop-types";

import QuestionDetailsSidebarPanel from "metabase/query_builder/components/view/sidebars/QuestionDetailsSidebarPanel";
import { SIDEBAR_VIEWS } from "./constants";

QuestionDetailsSidebar.propTypes = {
  question: PropTypes.object.isRequired,
  onOpenModal: PropTypes.func.isRequired,
};

function QuestionDetailsSidebar({ question, onOpenModal }) {
  const [view, setView] = useState(view);

  switch (view) {
    case SIDEBAR_VIEWS.DETAILS:
    default:
      return (
        <QuestionDetailsSidebarPanel
          setView={setView}
          question={question}
          onOpenModal={onOpenModal}
        />
      );
  }
}

export default QuestionDetailsSidebar;
