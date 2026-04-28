import { Ellipsified, FixedSizeIcon, Group } from "metabase/ui";

type DatabaseCellProps = {
  name: string;
};

export function DatabaseCell({ name }: DatabaseCellProps) {
  return (
    <Group align="center" gap="sm" miw={0} wrap="nowrap">
      <FixedSizeIcon name="database" />
      <Ellipsified tooltipProps={{ openDelay: 300 }}>{name}</Ellipsified>
    </Group>
  );
}
