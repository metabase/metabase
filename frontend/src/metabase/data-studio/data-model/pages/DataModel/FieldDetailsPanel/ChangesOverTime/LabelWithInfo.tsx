import { Icon, Tooltip } from "metabase/ui";

/** An info icon that explains a setting on hover */
export function InfoIcon({ info }: { info: string }) {
  return (
    <Tooltip label={info} maw={300} multiline>
      <Icon name="info" size={12} c="text-secondary" aria-label={info} />
    </Tooltip>
  );
}
