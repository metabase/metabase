import type { Ref } from "react";

import { Box } from "metabase/ui";
import type { CustomVizPluginId } from "metabase-types/api";

import S from "./SandboxedPluginContainer.module.css";

type Props = {
  containerRef: Ref<HTMLDivElement>;
  fill?: boolean;
  pluginId: CustomVizPluginId | undefined;
};

export function SandboxedPluginContainer({
  containerRef,
  fill = false,
  pluginId,
}: Props) {
  return (
    <Box className={S.container} h={fill ? "100%" : undefined} w="100%">
      <Box
        data-plugin-sandbox={pluginId}
        h={fill ? "100%" : undefined}
        ref={containerRef}
        w="100%"
      />
    </Box>
  );
}
