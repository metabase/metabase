import React from "react";
import PropTypes from "prop-types";

import Sidebar from "metabase/dashboard/components/Sidebar";
import QuestionPicker from "./QuestionPicker";

AddCardSidebar.propTypes = {
  onSelect: PropTypes.func.isRequired,
  initialCollection: PropTypes.number.isRequired,
};

export function AddCardSidebar(props) {
  return (
    <Sidebar>
      <div className="p2">
        <QuestionPicker {...props} />
      </div>
    </Sidebar>
  );
}
