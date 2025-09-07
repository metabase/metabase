import type { ReactNode } from "react";
import { useEffect } from "react";
import { tinykeys } from "tinykeys";

import { Box, Flex } from "metabase/ui";
import { MetabotChat } from "metabase-enterprise/metabot/components/MetabotChat";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";

type MetabotLayoutProps = {
  children?: ReactNode;
};

export function MetabotLayout({ children }: MetabotLayoutProps) {
  const { startNewConversation, visible } = useMetabotAgent();

  useEffect(() => {
    // Register keyboard shortcut for Shift+M
    return tinykeys(window, {
      "$mod+b": (e) => {
        e.preventDefault();
        startNewConversation("");
      },
    });
  }, [startNewConversation]);

  return (
    <Flex style={{ height: "100%", width: "100%" }}>
      <Box style={{ flex: 1, overflow: "auto" }}>{children}</Box>
      {visible && (
        <Box style={{ width: "30rem", height: "100%" }}>
          <MetabotChat />
        </Box>
      )}
    </Flex>
  );
}
