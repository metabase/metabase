import { useMemo } from "react";

import { Group, Pill } from "metabase/ui";
import type { TransformTag, TransformTagId } from "metabase-types/api";

type TagListProps = {
  tagIds: TransformTagId[];
  tags: TransformTag[];
};

export function TagList({ tagIds, tags }: TagListProps) {
  const tagById = useMemo(() => getTagById(tags), [tags]);

  return (
    <Group gap="sm">
      {getTagList(tagIds, tagById).map((tag) => (
        <Pill key={tag.id} c="text-primary" bg="background-secondary">
          {tag.name}
        </Pill>
      ))}
    </Group>
  );
}

export function getTagById(
  tags: TransformTag[],
): Record<TransformTagId, TransformTag> {
  return Object.fromEntries(tags.map((tag) => [tag.id, tag]));
}

export function getTagList(
  tagIds: TransformTagId[],
  tagById: Record<TransformTagId, TransformTag>,
) {
  return tagIds.map((tagId) => tagById[tagId]).filter((tag) => tag != null);
}
