import { t } from "ttag";

import { IconName } from "metabase/core/components/Icon";
import { DATA_BUCKET } from "../constants";

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
  buckets: (keyof typeof DATA_BUCKET)[];
  onChangeDataBucket: () => void;
};

type Bucket = {
  id: string;
  icon: IconName;
  name: string;
  description: string;
};

type ValueOf<T> = T[keyof T];

const BUCKETS: Record<ValueOf<typeof DATA_BUCKET>, Bucket> = {
  [DATA_BUCKET.DATASETS]: {
    id: DATA_BUCKET.DATASETS,
    icon: "model" as const,
    name: t`Models`,
    description: t`The best starting place for new questions.`,
  },
  [DATA_BUCKET.RAW_DATA]: {
    id: DATA_BUCKET.RAW_DATA,
    icon: "database" as const,
    name: t`Raw Data`,
    description: t`Unaltered tables in connected databases.`,
  },
  [DATA_BUCKET.SAVED_QUESTIONS]: {
    id: DATA_BUCKET.SAVED_QUESTIONS,
    name: t`Saved Questions`,
    icon: "folder" as const,
    description: t`Use any question’s results to start a new question.`,
  },
};

const DataSelectorDataBucketPicker = ({
  buckets,
  onChangeDataBucket,
}: DataSelectorDataBucketPickerProps) => (
  <List>
    {buckets
      .map(bucketId => BUCKETS[bucketId])
      .map(({ id, icon, name, description }) => (
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
