import { useEffect, useRef, useState } from "react";
import { t } from "ttag";

import {
  Box,
  Flex,
  Icon,
  Input,
  Transition,
  UnstyledButton,
} from "metabase/ui";

import { MetabotIcon } from "../MetabotIcon";
import { useMetabotAgent } from "../hooks";

import Styles from "./MetabotChat.module.css";
import { transitions } from "./utils";

export const MetabotChat = ({ onClose }: { onClose: () => void }) => {
  const [message, setMessage] = useState("");
  const { messages, sendMessage, sendMessageReq } = useMetabotAgent();

  const handleSend = () => {
    if (!message.length || sendMessageReq.isLoading) {
      return;
    }
    setMessage("");
    sendMessage(message).catch(err => console.error(err));
  };

  const handleClose = () => {
    setMessage("");
    onClose();
  };

  // animate once mounted
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // auto-focus once animation in completes
  const [entered, setEntered] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    entered && inputRef.current?.focus();
  }, [entered]);

  // animate messages once we have some amount of messages to show the user
  const [showMessages, setShowMessages] = useState(false);
  useEffect(() => {
    setShowMessages(messages.length > 0);
  }, [messages]);

  return (
    <Transition
      mounted={mounted}
      onEntered={() => setEntered(true)}
      transition={transitions.chatBarSlideIn}
      duration={150}
      timingFunction="ease"
    >
      {style => (
        <Box className={Styles.container} style={style}>
          {messages.length > 0 && (
            <Box className={Styles.responses}>
              {messages.map((msg, index) => (
                <Transition
                  key={index}
                  mounted={showMessages}
                  transition={transitions.messageSlideIn}
                  duration={150}
                  timingFunction="ease"
                >
                  {style => (
                    <Box className={Styles.response} style={style}>
                      {msg.message}
                    </Box>
                  )}
                </Transition>
              ))}
            </Box>
          )}
          <Flex className={Styles.innerContainer}>
            <Box w="33px" h="24px">
              <MetabotIcon />
            </Box>
            <Input
              w="100%"
              ref={inputRef}
              value={message}
              className={Styles.input}
              styles={{ input: { border: "none" } }}
              placeholder={t`Tell me to do something, or ask a question`}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter") {
                  handleSend();
                }
              }}
            />
            <UnstyledButton h="1rem" onClick={handleClose}>
              <Icon name="close" c="text-light" size="1rem" />
            </UnstyledButton>
          </Flex>
        </Box>
      )}
    </Transition>
  );
};
