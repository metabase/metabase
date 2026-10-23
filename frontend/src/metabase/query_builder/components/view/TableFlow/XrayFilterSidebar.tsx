import { useState } from "react";
import { t } from "ttag";

import { SidebarContent } from "metabase/common/components/SidebarContent";
import { MultiStageFilterPicker } from "metabase/querying/filters/components/FilterPicker/MultiStageFilterPicker";
import { color } from "metabase/ui/utils/colors";
import type * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

type XrayFilterSidebarProps = {
  question: Question;
  onQuestionChange: (question: Question) => void;
  onClose: () => void;
};

/**
 * Keeps a filter picker open for adding filters. Filters go into the stages the question
 * already has, so they apply before its summary.
 */
export function XrayFilterSidebar({
  question,
  onQuestionChange,
  onClose,
}: XrayFilterSidebarProps) {
  // remounting resets the picker to its column list after each added filter
  const [pickerKey, setPickerKey] = useState(0);
  const query = question.query();

  const handleQueryChange = (nextQuery: Lib.Query) =>
    onQuestionChange(question.setQuery(nextQuery));

  return (
    <SidebarContent
      title={t`Filter`}
      color={color("core-filter")}
      onDone={onClose}
      data-testid="xray-filter-sidebar"
    >
      <MultiStageFilterPicker
        key={pickerKey}
        query={query}
        canAppendStage={false}
        onChange={handleQueryChange}
        onClose={() => setPickerKey(pickerKey + 1)}
      />
    </SidebarContent>
  );
}
