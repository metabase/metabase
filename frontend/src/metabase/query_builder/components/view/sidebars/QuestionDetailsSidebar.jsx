import React from "react";
import PropTypes from "prop-types";

import SidebarContent from "metabase/query_builder/components/SidebarContent";
import QuestionActionButtons from "metabase/questions/components/QuestionActionButtons";

function QuestionDetailsSidebar({ question, onOpenModal }) {
  const canWrite = question && question.canWrite();

  return (
    <SidebarContent className="full-height px1">
      <div>
        <QuestionActionButtons canWrite={canWrite} onOpenModal={onOpenModal} />
      </div>
    </SidebarContent>
  );
}

QuestionDetailsSidebar.propTypes = {
  question: PropTypes.object.isRequired,
  onOpenModal: PropTypes.func.isRequired,
};

export default QuestionDetailsSidebar;
