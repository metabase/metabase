import { DataTypeInfoItem } from "metabase/containers/DataPicker";

import {
  DataBucketListItemContainer as ItemContainer,
  DataBucketListItemDescription as ItemDescription,
  DataBucketListItemDescriptionContainer as ItemDescriptionContainer,
  DataBucketListItemIcon as ItemIcon,
  DataBucketListItemTitle as ItemTitle,
  DataBucketList as List,
  DataBucketTitleContainer as TitleContainer,
} from "./DataSelectorDataBucketPicker.styled";

type DataSelectorDataBucketPickerProps = {
  dataTypes: DataTypeInfoItem[];
  onChangeDataBucket: () => void;
};

const DataSelectorDataBucketPicker = ({
  dataTypes,
  onChangeDataBucket,
}: DataSelectorDataBucketPickerProps) => (
  <List>
    {dataTypes.map(({ id, icon, name, description }) => (
      <DataBucketListItem
        description={description}
        id={id}
        icon={icon}
        key={id}
        name={name}
        onSelect={onChangeDataBucket}
      />
    ))}
  </List>
);

type DataBucketListItemProps = DataTypeInfoItem & {
  onSelect: () => void;
};

const DataBucketListItem = ({
  description,
  icon,
  name,
  onSelect,
}: DataBucketListItemProps) => (
  <ItemContainer name={name} onSelect={onSelect}>
    <TitleContainer>
      <ItemIcon name={icon} size={18} />
      <ItemTitle>{name}</ItemTitle>
    </TitleContainer>
    <ItemDescriptionContainer>
      <ItemDescription>{description}</ItemDescription>
    </ItemDescriptionContainer>
  </ItemContainer>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DataSelectorDataBucketPicker;
