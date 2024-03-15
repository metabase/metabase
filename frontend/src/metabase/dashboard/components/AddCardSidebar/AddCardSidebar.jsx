import PropTypes from "prop-types";
import { t } from "ttag";

import { QuestionPickerModal } from "metabase/common/components/EntityPicker";
import { Sidebar } from "metabase/dashboard/components/Sidebar";


AddCardSidebar.propTypes = {
  onSelect: PropTypes.func.isRequired,
  initialCollection: PropTypes.number,
};

export function AddCardSidebar({
  onClose,
  onSelect,
}) {
  return (
    <Sidebar data-testid="add-card-sidebar">
      <QuestionPickerModal
        title={t`Add a question to this dashboard`}
        value={{ model: "collection", id: 'root' }}
        onChange={question => {
          onSelect(question.id);
          onClose();
        }}
        onClose={onClose}
      />
    </Sidebar>
  );
}
