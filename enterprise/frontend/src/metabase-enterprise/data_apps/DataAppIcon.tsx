import { EntityIcon } from "metabase/common/components/EntityIcon";
import { Flex } from "metabase/ui";
import type { DataApp } from "metabase-types/api";

type Props = {
  app: DataApp;
};

const ICON_SIZE = 20;

export function DataAppIcon({ app }: Props) {
  return (
    <Flex
      align="center"
      bd="1px solid var(--mb-color-border)"
      bdrs="xl"
      bg="background-secondary"
      justify="center"
      w="3.125rem"
      h="3.125rem"
      style={{ flexShrink: 0 }}
    >
      <EntityIcon alt={app.display_name} name="dashboard" size={ICON_SIZE} />
    </Flex>
  );
}
