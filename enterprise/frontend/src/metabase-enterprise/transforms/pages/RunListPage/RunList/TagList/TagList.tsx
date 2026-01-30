import { Ellipsified } from "metabase/common/components/Ellipsified";
import { Box } from "metabase/ui";
import type { TransformTag, TransformTagId } from "metabase-types/api";

import S from "./TagList.module.css";

type TagListProps = {
  tagIds: TransformTagId[];
  tags: TransformTag[];
};

export function TagList({ tagIds, tags }: TagListProps) {
  const tagById = getTagById(tags);
  const currentTags = getTagList(tagIds, tagById);
  const currentTagsLabel = currentTags.map((tag) => tag.name).join(", ");

  return (
    <Ellipsified tooltip={currentTagsLabel}>
      {currentTags.map((tag) => (
        <Box
          key={tag.id}
          component="span"
          className={S.tag}
          c="text-primary"
          fw="bold"
          bg="background-secondary"
          px="sm"
          bdrs="xs"
        >
          {tag.name}
        </Box>
      ))}
    </Ellipsified>
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
