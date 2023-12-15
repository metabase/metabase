import { Box } from "metabase/ui";
import { color } from "metabase/lib/colors";
import type { SearchResult } from "metabase-types/api";
import { tabOptions, type ValidTab } from "../../utils";
import type { EntityPickerOptions } from "../../types";

export const SinglePickerView = ({
  model,
  onItemSelect,
  value,
  options,
}: {
  model: ValidTab;
  onItemSelect: (item: Partial<SearchResult>) => void;
  value?: SearchResult;
  options?: EntityPickerOptions;
}) => {
  const { component: PickerComponent } = tabOptions[model];

  return (
    <Box
      style={{
        borderTop: `1px solid ${color("border")}`,
        flexGrow: 1,
        height: 0,
      }}
    >
      <PickerComponent
        onItemSelect={onItemSelect}
        value={value}
        options={options}
      />
    </Box>
  );
};
