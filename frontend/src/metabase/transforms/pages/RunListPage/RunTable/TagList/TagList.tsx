import type { TransformTag } from "metabase-types/api";
import { Group, Pill } from "metabase/ui";

type TagListProps = {
  tags: TransformTag[];
};

export function TagList({ tags }: TagListProps) {
  return (
    <Group gap="sm">
      {tags.map((tag) => (
        <Pill key={tag.id}>{tag.name}</Pill>
      ))}
    </Group>
  );
}
