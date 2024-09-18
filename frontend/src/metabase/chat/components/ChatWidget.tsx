import { useRef, useState } from "react";

import { Box, Flex, Paper, Popover } from "metabase/ui";

import { Chat } from "./Chat";
import Styles from "./ChatWidget.module.css";
import MetabotLogo from "metabase/core/components/MetabotLogo";

export const ChatWidget = () => {
  const scrollableStackRef = useRef<HTMLDivElement | null>(null);
  const [opened, setOpened] = useState(false);

  return (
    <div className={Styles.ChatWidget}>
      <Popover opened={opened} position="bottom-end" offset={-24}>
        <Popover.Target>
          <div>
            <Flex
              justify="center"
              align="center"
              w="3rem"
              h="3rem"
              className={Styles.ChatLauncher}
              style={{ visibility: opened ? "hidden" : "visible" }}
              onClick={() => setOpened(o => !o)}
            >
              <MetabotLogo className={Styles.MetabotLogo} />
            </Flex>
          </div>
        </Popover.Target>
        <Popover.Dropdown className={Styles.WidgetDropdown}>
          <Box
            h="100%"
            ref={scrollableStackRef}
            className={Styles.WidgetContainer}
          >
            <Paper shadow="md" mah="70dvh" maw="25rem">
              <Chat
                setWidgetOpened={setOpened}
                scrollableStackRef={scrollableStackRef}
              />
            </Paper>
          </Box>
        </Popover.Dropdown>
      </Popover>
    </div>
  );
};
