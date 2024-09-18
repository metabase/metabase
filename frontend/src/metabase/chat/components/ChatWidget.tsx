import { MetabotIcon } from "metabase/metabot/components/MetabotMessage/MetabotMessage.styled";
import { Popover } from "metabase/ui";
import Styles from "./ChatWidget.module.css";

export const ChatWidget = () => {
  return (
    <div className={Styles.ChatWidget}>
      <Popover>
        <Popover.Target>
          <MetabotIcon />
        </Popover.Target>
        <Popover.Dropdown>
          <Conversation />
        </Popover.Dropdown>
      </Popover>
    </div>
  );
};

const Conversation = () => {
  return (
    <div>
      Congratulations! You've successfully implemented the ChatWidget component.
    </div>
  );
};
