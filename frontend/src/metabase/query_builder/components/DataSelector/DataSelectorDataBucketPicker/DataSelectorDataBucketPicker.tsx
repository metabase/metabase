import { t } from "ttag";

import { DATA_BUCKET } from "../constants";

import {
  DataBucketList as List,
  DataBucketListItemContainer as ItemContainer,
  DataBucketTitleContainer as TitleContainer,
  DataBucketListItemIcon as ItemIcon,
  DataBucketListItemTitle as ItemTitle,
  DataBucketListItemDescriptionContainer as ItemDescriptionContainer,
  DataBucketListItemDescription as ItemDescription,
} from "./DataSelectorDataBucketPicker.styled";

type DataSelectorDataBucketPickerProps = {
  onChangeDataBucket: () => void;
};

type Bucket = {
  id: string;
  icon: string;
  name: string;
  description: string;
  onSelect: () => void;
};

const BUCKETS = [
  {
    id: DATA_BUCKET.DATASETS,
    icon: "model",
    name: t`Models`,
    description: t`The best starting place for new questions.`,
  },
  {
    id: DATA_BUCKET.RAW_DATA,
    icon: "database",
    name: t`Raw Data`,
    description: t`Unaltered tables in connected databases.`,
  },
  {
    id: DATA_BUCKET.SAVED_QUESTIONS,
    name: t`Saved Questions`,
    icon: "folder",
    description: t`Use any question’s results to start a new question.`,
  },
];

const DataSelectorDataBucketPicker = ({
  onChangeDataBucket,
}: DataSelectorDataBucketPickerProps) => (
  <List>
    {BUCKETS.map(bucket => (
      <DataBucketListItem
        {...bucket}
        key={bucket.id}
        onSelect={onChangeDataBucket}
      />
    ))}
  </List>
);

const DataBucketListItem = (props: Bucket) => {
  const { name, icon, description } = props;

  return (
    <ItemContainer {...props}>
      <TitleContainer>
        <ItemIcon name={icon} size={18} />
        <ItemTitle>{name}</ItemTitle>
      </TitleContainer>
      <ItemDescriptionContainer>
        <ItemDescription>{description}</ItemDescription>
      </ItemDescriptionContainer>
    </ItemContainer>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DataSelectorDataBucketPicker;
