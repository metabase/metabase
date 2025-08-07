import { t } from "ttag";

import {
  MultiSelect,
  SelectItem,
  type SelectItemProps,
  Text,
} from "metabase/ui";
import { useListTransformTagsQuery } from "metabase-enterprise/api/transform-tag";
import type { TransformTag, TransformTagId } from "metabase-types/api";

type TagMultiSelectProps = {
  tagIds: TransformTagId[];
  onChange: (tagIds: TransformTagId[]) => void;
};

export function TagMultiSelect({ tagIds, onChange }: TagMultiSelectProps) {
  const { data: tags = [] } = useListTransformTagsQuery();

  const handleChange = (value: string[]) => {
    onChange(value.map(getTagId));
  };

  return (
    <MultiSelect
      value={tagIds.map(getValue)}
      data={tags.map(getOption)}
      placeholder={t`Add tags`}
      searchable
      renderOption={(item) => (
        <TagSelectItem {...item.option} selected={item.checked} />
      )}
      onChange={handleChange}
    />
  );
}

type TagSelectItemProps = SelectItemProps & {
  value: string;
  label: string;
};

function TagSelectItem({ label, selected }: TagSelectItemProps) {
  return (
    <SelectItem selected={selected}>
      <Text c="inherit" lh="inherit">
        {label}
      </Text>
    </SelectItem>
  );
}

function getValue(tagId: TransformTagId) {
  return String(tagId);
}

function getOption(tag: TransformTag) {
  return { value: getValue(tag.id), label: tag.name };
}

function getTagId(value: string): TransformTagId {
  return parseInt(value, 10);
}
