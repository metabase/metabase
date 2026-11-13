import { Group, Icon, Tooltip } from "metabase/ui";

/** An info icon that explains a setting on hover */
export function InfoIcon({ info }: { info: string }) {
  return (
    <Tooltip label={info} maw={300} multiline>
      <Icon name="info" size={12} c="text-secondary" aria-label={info} />
    </Tooltip>
  );
}

/** A form field label followed by an info icon */
export function LabelWithInfo({
  label,
  info,
}: {
  label: string;
  info: string;
}) {
  return (
    <Group component="span" gap="xs" wrap="nowrap" display="inline-flex">
      {label}
      <InfoIcon info={info} />
    </Group>
  );
}
