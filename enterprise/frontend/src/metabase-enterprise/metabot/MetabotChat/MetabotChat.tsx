import cx from "classnames";
import { useState } from "react";
import { t } from "ttag";

import { Box, Button, Flex, Input, Text } from "metabase/ui";

import { MetabotIcon } from "../MetabotIcon";
import { useMetabotAgent } from "../hooks";

import Styles from "./MetabotChat.module.css";

export const MetabotChat = () => {
  const [message, setMessage] = useState("");
  const { chatHistory, sendMessage, sendMessageReq } = useMetabotAgent();

  const handleSend = () => {
    if (!message.length) {
      return;
    }
    setMessage("");
    // TODO: future - display errors in the UI
    sendMessage(message).catch(err => console.error(err));
  };

  return (
    <Flex className={Styles.container}>
      <Flex direction="column" w="100%">
        <Flex gap=".75rem">
          <Box w="33px" h="24px">
            <MetabotIcon />
          </Box>
          <Text>How can I help you today?</Text>
        </Flex>
        <Flex direction="column">
          {chatHistory.map(msg => (
            <Box
              // TODO: give messages unique ids
              key={msg.message}
              className={cx(
                Styles.message,
                msg.source === "user"
                  ? Styles.messageUser
                  : Styles.messageSystem,
              )}
            >
              {msg.message}
            </Box>
          ))}
        </Flex>
        <Flex mt="1rem" gap="xs" w="100%">
          <Input
            w="100%"
            value={message}
            placeholder="Tell me to do something, or ask a question"
            onChange={e => setMessage(e.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter") {
                handleSend();
              }
            }}
          />
          <Button
            variant="filled"
            style={{ flexShrink: 0 }}
            onClick={handleSend}
            disabled={sendMessageReq.isLoading}
          >
            {t`Send`}
          </Button>
        </Flex>
      </Flex>
    </Flex>
  );
};
