import { Badge, Group, Title } from "metabase/ui";

type ErrorTableHeaderProps = {
  title: string;
  count: number;
};

export function ErrorTableHeader({ title, count }: ErrorTableHeaderProps) {
  return (
    <Group gap="sm" wrap="nowrap">
      <Badge variant="filled" bg="error">
        {count}
      </Badge>
      <Title order={5}>{title}</Title>
    </Group>
  );
}
