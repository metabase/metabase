import { Flex, Icon } from "metabase/ui";
import { getPluginAssetUrl } from "metabase/visualizations/custom-visualizations/custom-viz-utils";
import type { CustomVizPlugin } from "metabase-types/api";

type Props = {
  plugin: CustomVizPlugin;
};

const ICON_SIZE = 20;

export function CustomVizIcon({ plugin }: Props) {
  const iconUrl = getPluginAssetUrl(plugin.id, plugin.icon);
  const dimmed = !plugin.enabled;

  return (
    <Flex
      align="center"
      bd="1px solid var(--mb-color-border)"
      bdrs="xl"
      justify="center"
      opacity={dimmed ? 0.6 : undefined}
      w="3.125rem"
      h="3.125rem"
      style={{
        flexShrink: 0,
      }}
    >
      {iconUrl ? (
        <img
          alt={plugin.display_name}
          height={ICON_SIZE}
          src={iconUrl}
          style={dimmed ? { filter: "grayscale(1)", opacity: 0.6 } : undefined}
          width={ICON_SIZE}
        />
      ) : (
        <Icon
          c={dimmed ? "text-secondary" : undefined}
          name="unknown"
          size={ICON_SIZE}
        />
      )}
    </Flex>
  );
}
