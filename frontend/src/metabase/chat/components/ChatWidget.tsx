import { useRef } from "react";

import { MetabotIcon } from "metabase/metabot/components/MetabotMessage/MetabotMessage.styled";
import { Popover } from "metabase/ui";

import { Chat } from "./Chat";
import Styles from "./ChatWidget.module.css";

export const ChatWidget = () => {
  const scrollableStackRef = useRef<HTMLDivElement | null>(null);
  return (
    <div className={Styles.ChatWidget}>
      <Popover>
        <Popover.Target>
          <MetabotIcon />
        </Popover.Target>
        <Popover.Dropdown>
          <div ref={scrollableStackRef}>
            <Chat scrollableStackRef={scrollableStackRef} />
          </div>
        </Popover.Dropdown>
      </Popover>
    </div>
  );
};
