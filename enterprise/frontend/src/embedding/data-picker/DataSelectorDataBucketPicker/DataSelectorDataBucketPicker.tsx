import { SelectList } from "metabase/common/components/SelectList";
import { Box, Flex, Icon } from "metabase/ui";

import type { DataTypeInfoItem } from "../types";

import DataSelectorDataBucketPickerS from "./DataSelectorDataBucketPicker.module.css";

type DataSelectorDataBucketPickerProps = {
  dataTypes: DataTypeInfoItem[];
  onChangeDataBucket: (id: DataTypeInfoItem["id"]) => void;
};

const DataSelectorDataBucketPicker = ({
  dataTypes,
  onChangeDataBucket,
}: DataSelectorDataBucketPickerProps) => (
  <SelectList className={DataSelectorDataBucketPickerS.DataBucketList}>
    {dataTypes.map(({ id, icon, name, description }) => (
      <DataBucketListItem
        description={description}
        id={id}
        icon={icon}
        key={id}
        name={name}
        onSelect={() => onChangeDataBucket(id)}
      />
    ))}
  </SelectList>
);

type DataBucketListItemProps = DataTypeInfoItem & {
  onSelect: () => void;
};

const DataBucketListItem = ({
  description,
  icon,
  id,
  name,
  onSelect,
}: DataBucketListItemProps) => (
  <SelectList.BaseItem
    className={DataSelectorDataBucketPickerS.DataBucketListItemContainer}
    data-testid="data-bucket-list-item"
    id={id}
    name={name}
    onSelect={onSelect}
  >
    <Flex align="center">
      <Icon
        className={DataSelectorDataBucketPickerS.DataBucketListItemIcon}
        name={icon}
        size={18}
      />
      <Box
        component="span"
        className={DataSelectorDataBucketPickerS.DataBucketListItemTitle}
      >
        {name}
      </Box>
    </Flex>
    <Box mt="xs">
      <Box
        component="span"
        className={DataSelectorDataBucketPickerS.DataBucketListItemDescription}
      >
        {description}
      </Box>
    </Box>
  </SelectList.BaseItem>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DataSelectorDataBucketPicker;
