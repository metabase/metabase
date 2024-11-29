import SelectList from "metabase/components/SelectList";
import { Box, Flex } from "metabase/ui";

import type { DataTypeInfoItem } from "../types";

import DataSelectorDataBucketPickerS from "./DataSelectorDataBucketPicker.module.css";
import {
  DataBucketListItemContainer as ItemContainer,
  DataBucketListItemDescription as ItemDescription,
  DataBucketListItemIcon as ItemIcon,
  DataBucketListItemTitle as ItemTitle,
} from "./DataSelectorDataBucketPicker.styled";

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
  <ItemContainer
    data-testid="data-bucket-list-item"
    id={id}
    name={name}
    onSelect={onSelect}
  >
    <Flex align="center">
      <ItemIcon name={icon} size={18} />
      <ItemTitle>{name}</ItemTitle>
    </Flex>
    <Box mt="xs">
      <ItemDescription>{description}</ItemDescription>
    </Box>
  </ItemContainer>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DataSelectorDataBucketPicker;
