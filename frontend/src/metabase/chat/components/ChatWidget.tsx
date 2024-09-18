import { useRef } from "react";

import { Flex, Paper, Popover } from "metabase/ui";

import { Chat } from "./Chat";
import Styles from "./ChatWidget.module.css";
import MetabotLogo from "metabase/core/components/MetabotLogo";

export const ChatWidget = () => {
  const scrollableStackRef = useRef<HTMLDivElement | null>(null);
  return (
    <div className={Styles.ChatWidget}>
      <Popover position="bottom-end">
        <Popover.Target>
          <Flex
            justify="center"
            align="center"
            w="3rem"
            h="3rem"
            className={Styles.ChatLauncher}
          >
            <MetabotLogo className={Styles.MetabotLogo} />
          </Flex>
        </Popover.Target>
        <Popover.Dropdown>
          <Paper mah="70dvh" maw="20rem">
            <div ref={scrollableStackRef}>
              <Chat scrollableStackRef={scrollableStackRef} />
            </div>
          </Paper>
        </Popover.Dropdown>
      </Popover>
    </div>
  );
};
