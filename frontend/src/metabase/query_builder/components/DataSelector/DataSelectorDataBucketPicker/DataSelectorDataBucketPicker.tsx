import { useDataPickerConfig } from "metabase/containers/DataPicker";
import { IconName } from "metabase/core/components/Icon";

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
  onChangeDataBucket: () => void;
};

type Bucket = {
  id: string;
  icon: IconName;
  name: string;
  description: string;
};

const DataSelectorDataBucketPicker = ({
  onChangeDataBucket,
}: DataSelectorDataBucketPickerProps) => {
  const { dataTypes } = useDataPickerConfig();

  return (
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
};

type DataBucketListItemProps = Bucket & {
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
