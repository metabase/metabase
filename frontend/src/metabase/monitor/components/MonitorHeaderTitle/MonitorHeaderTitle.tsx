import { Title, type TitleProps } from "metabase/ui";

export function MonitorHeaderTitle(props: TitleProps) {
  return <Title {...props} order={2} fz="sm" fw="normal" c="text-secondary" />;
}
