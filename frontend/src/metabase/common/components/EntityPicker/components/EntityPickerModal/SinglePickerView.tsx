import { Box } from "metabase/ui";
import { color } from "metabase/lib/colors";
import type { EntityPickerOptions, EntityTab, PickerItem } from "../../types";

export const SinglePickerView = ({
  TabComponent,
  onItemSelect,
  value,
  options,
}: {
  TabComponent: EntityTab;
  onItemSelect: (item: PickerItem) => void;
  value?: PickerItem;
  options?: EntityPickerOptions;
}) => {

  return (
    <Box
      style={{
        borderTop: `1px solid ${color("border")}`,
        flexGrow: 1,
        height: 0,
      }}
    >
      <TabComponent
        onItemSelect={onItemSelect}
        value={value}
        options={options}
      />
    </Box>
  );
};
