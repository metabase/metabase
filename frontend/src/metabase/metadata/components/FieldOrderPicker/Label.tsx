import { Flex, Icon, Tooltip } from "metabase/ui";
import type { IconName } from "metabase-types/api";
interface Props {
  icon: IconName;
  tooltip: string;
}

export const Label = ({ icon, tooltip }: Props) => (
  <Tooltip label={tooltip}>
    <Flex aria-label={tooltip} align="center" justify="center" w={24}>
      <Icon name={icon} />
    </Flex>
  </Tooltip>
);
