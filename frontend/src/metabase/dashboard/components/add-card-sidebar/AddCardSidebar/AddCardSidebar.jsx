import PropTypes from "prop-types";

import { Sidebar } from "metabase/dashboard/components/Sidebar";
import { QuestionPickerConnected } from "../QuestionPicker";

AddCardSidebar.propTypes = {
  onSelect: PropTypes.func.isRequired,
  initialCollection: PropTypes.number,
};

export function AddCardSidebar(props) {
  return (
    <Sidebar data-testid="add-card-sidebar">
      <QuestionPickerConnected {...props} />
    </Sidebar>
  );
}
