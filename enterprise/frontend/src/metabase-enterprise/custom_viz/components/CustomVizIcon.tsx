import { EntityIcon } from "metabase/common/components/EntityIcon";
import { Flex } from "metabase/ui";
import { getPluginAssetUrl } from "metabase/visualizations/custom-visualizations/custom-viz-utils";
import type { CustomVizPlugin } from "metabase-types/api";

type Props = {
  plugin: CustomVizPlugin;
};

const ICON_SIZE = 20;

export function CustomVizIcon({ plugin }: Props) {
  const iconUrl = getPluginAssetUrl(plugin.id, plugin.icon);

  return (
    <Flex
      align="center"
      bd="1px solid var(--mb-color-border)"
      bdrs="xl"
      bg="background-secondary"
      justify="center"
      w="3.125rem"
      h="3.125rem"
      style={{
        flexShrink: 0,
      }}
    >
      <EntityIcon
        alt={plugin.display_name}
        iconUrl={iconUrl}
        name="unknown"
        size={ICON_SIZE}
      />
    </Flex>
  );
}
