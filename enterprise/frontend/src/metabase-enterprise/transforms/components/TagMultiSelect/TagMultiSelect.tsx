import { t } from "ttag";

import { MultiSelect } from "metabase/ui";
import { useListTransformTagsQuery } from "metabase-enterprise/api/transform-tag";
import type { TransformTagId } from "metabase-types/api";

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
      data={tags.map((tag) => ({ value: getValue(tag.id), label: tag.name }))}
      placeholder={t`Add tags`}
      searchable
      onChange={handleChange}
    />
  );
}

function getValue(tagId: TransformTagId) {
  return String(tagId);
}

function getTagId(value: string): TransformTagId {
  return parseInt(value, 10);
}
