import { useEffect, useState } from "react";
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

const slideIn = {
  in: { opacity: 1, transform: "translate(0, 0)" },
  out: { opacity: 0, transform: "translate(0, .5rem)" },
  common: { transformOrigin: "top" },
  transitionProperty: "transform, opacity",
};

export const MetabotChat = ({ onClose }: { onClose: () => void }) => {
  const [message, setMessage] = useState("");
  const { messages, sendMessage, sendMessageReq, reset } = useMetabotAgent();

  const handleSend = () => {
    if (!message.length || sendMessageReq.isLoading) {
      return;
    }
    setMessage("");
    // TODO: future - display errors in the UI
    sendMessage(message).catch(err => console.error(err));
  };

  const handleClose = () => {
    reset();
    setMessage("");
    onClose();
  };

  // Cause an addition render for animated responses from Metabot
  // so they can be transitioned in after being mounted
  const [showMessages, setShowMessages] = useState(false);
  useEffect(() => {
    setShowMessages(messages.length > 0);
  }, [messages]);

  return (
    <Box className={Styles.container}>
      {messages.length > 0 && (
        <Box className={Styles.responses}>
          {messages.map((msg, index) => (
            <Transition
              key={index}
              mounted={showMessages}
              transition={slideIn}
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
  );
};
