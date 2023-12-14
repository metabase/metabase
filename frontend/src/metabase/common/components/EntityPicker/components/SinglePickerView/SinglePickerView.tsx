import { Box } from "metabase/ui";
import { color } from "metabase/lib/colors";
import { tabOptions, type ValidTab } from "../../utils";
import type { EntityPickerModalOptions } from "../../types";

export const SinglePickerView = ({
  model,
  onItemSelect,
  value,
  options,
}: {
  model: ValidTab;
  onItemSelect: (item: any) => void;
  value?: any;
  options: EntityPickerModalOptions;
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
