import { Group, Pill } from "metabase/ui";
import type { TransformTag } from "metabase-types/api";

type TagListProps = {
  tags: TransformTag[];
};

export function TagList({ tags }: TagListProps) {
  return (
    <Group gap="sm">
      {tags.map((tag) => (
        <Pill key={tag.id} c="text-primary" bg="background-secondary">
          {tag.name}
        </Pill>
      ))}
    </Group>
  );
}
