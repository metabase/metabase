import { createRef, useCallback, useEffect, useMemo, useState } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";
import _ from "underscore";

import Markdown from "metabase/core/components/Markdown";
import MetabotLogo from "metabase/core/components/MetabotLogo";
import {
  Box,
  Button,
  Flex,
  Group,
  Icon,
  Loader,
  Paper,
  Stack,
  Text,
  Textarea,
} from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import Styles from "./EditVizPage.module.css";
import type { PydanticModelSchemaName } from "./types";
import { adhockifyURL, getLLMResponse, isStringifiedQuery } from "./utils";

type Author = "user" | "llm";

type Message = {
  content: string;
  author: Author;
};

const isAuthor = (author: unknown): author is Author => {
  return author === "user" || author === "llm";
};

const isMessage = (message: unknown): message is Message => {
  if (!_.isObject(message)) {
    return false;
  }
  if (!("content" in message)) {
    return false;
  }
  if (!("author" in message)) {
    return false;
  }
  if (!isAuthor(message.author)) {
    return false;
  }
  if (!_.isString(message.content)) {
    return false;
  }
  return true;
};

export const EditVizPage = ({
  scrollableStackRef,
  question,
}: {
  question: Question;
  scrollableStackRef: React.RefObject<HTMLDivElement>;
}) => {
  const query = question._card.dataset_query;
  const visualizationSettings = question._card.visualization_settings;

  const savedMessages = useMemo(() => {
    const messagesJson = localStorage.getItem("messages");
    if (!messagesJson) {
      return [];
    }
    try {
      const messages = JSON.parse(messagesJson);
      if (!Array.isArray(messages)) {
        throw "Saved messages are not an array";
      }
      if (!messages.every(m => isMessage(m))) {
        throw "Saved messages do not all conform to the Message type";
      }
      return messages as Message[];
    } catch (e) {
      console.error(e, messagesJson);
      return [];
    }
  }, []);

  const [messages, setMessages] = useState<Message[]>(savedMessages);

  const scrollMessagesToBottom = useCallback(
    () =>
      scrollableStackRef.current?.scrollTo({
        top: scrollableStackRef.current?.scrollHeight + 1000,
      }),
    [scrollableStackRef],
  );

  useEffect(() => {
    localStorage.setItem("messages", JSON.stringify(messages));
  }, [messages]);

  const addMessage = useCallback(
    (message: Message) => {
      setMessages(messages => [...messages, message]);
    },
    [setMessages],
  );

  const [isAwaitingLLMResponse, setIsAwaitingLLMResponse] = useState(false);

  useEffect(() => {
    scrollMessagesToBottom();
    const sendMessageToLLM = async () => {
      const lastMessage = _.last(messages);
      if (!lastMessage || lastMessage.author !== "user") {
        return;
      }
      const content = lastMessage.content;
      if (!content) {
        return;
      }
      setIsAwaitingLLMResponse(true);
      let systemPrompt = "Your name is Metabot. ";
      let modelSchemaName: PydanticModelSchemaName | undefined = undefined;
      if (/^\[query\]/.test(content)) {
        systemPrompt += `Here is a json object representing the currently viewed question: ${JSON.stringify(
          query,
        )}. Here's a json object representing this question's visualization settings: ${JSON.stringify(
          visualizationSettings,
        )}`;
        modelSchemaName = "QueryWithViz";
      }
      let response = await getLLMResponse(
        content,
        modelSchemaName,
        systemPrompt,
      );
      const maybeQuery = isStringifiedQuery(response);
      if (maybeQuery) {
        const completeQuery = { dataset_query: query, ...maybeQuery };
        const { adhocQuestionURL } = adhockifyURL(completeQuery);

        response = `[See results](${adhocQuestionURL})`;
      }
      addMessage({
        content: response,
        author: "llm",
      });
      setIsAwaitingLLMResponse(false);
    };
    sendMessageToLLM();
  }, [
    messages,
    query,
    visualizationSettings,
    addMessage,
    scrollableStackRef,
    scrollMessagesToBottom,
    setIsAwaitingLLMResponse,
  ]);

  return (
    <>
      <Stack
        spacing="sm"
        p="1rem"
        data-testid="edit-viz-page"
        pos="relative"
        justify="flex-end"
      >
        <Messages messages={messages} />
      </Stack>
      <Box
        pos="absolute"
        w="calc(100% - 1rem)"
        bg="linear-gradient(to bottom, transparent, white 75%)"
        bottom={0}
      >
        <Box p="1rem" pr=".5rem">
          <WriteMessage
            isAwaitingLLMResponse={isAwaitingLLMResponse}
            addMessage={addMessage}
          />
        </Box>
      </Box>
    </>
  );
};

const WriteMessage = ({
  addMessage,
  isAwaitingLLMResponse,
}: {
  addMessage: (message: Message) => void;
  isAwaitingLLMResponse: boolean;
}) => {
  const textareaRef = createRef<HTMLTextAreaElement>();

  const submitMessage = useCallback(() => {
    const messageContent = textareaRef.current?.value;
    if (!messageContent) {
      return;
    }
    addMessage({
      content: textareaRef.current?.value,
      author: "user",
    });
    textareaRef.current.value = "";
  }, [textareaRef, addMessage]);

  return (
    <Flex
      w="100%"
      gap="sm"
      pos="relative"
      bg="#f4f4f4"
      style={{ borderRadius: "1rem" }}
    >
      <Textarea
        style={{ border: 0, flexGrow: 1, width: "100%" }}
        ref={textareaRef}
        rows={1}
        placeholder={t`Message Metabot`}
        pr="2.5rem"
        styles={{
          input: {
            border: 0,
            background: "transparent",
            padding: ".75rem ! important",
          },
        }}
        onKeyDown={e => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submitMessage();
          }
        }}
      />
      <Button
        pos="absolute"
        bottom=".35rem"
        right=".35rem"
        w="2rem"
        h="2rem"
        aria-label={t`Send`}
        p="xs"
        radius="100%"
        variant="filled"
        onClick={submitMessage}
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {isAwaitingLLMResponse ? (
          <Loader
            variant="dots"
            color="#fff"
            size="xs"
            pos="relative"
            top="-4px"
          />
        ) : (
          <Icon name="arrow_up" width="1rem" height="1rem" />
        )}
      </Button>
    </Flex>
  );
};

const AIMessageDisplay = ({ message }: { message: Message }) => {
  return (
    <Flex justify="flex-start">
      <Flex maw="100%">
        <Group noWrap align="flex-start" spacing="sm">
          <MetabotLogo style={{ width: "1.5rem" }} />
          <Markdown linkTarget="" className={Styles.AIMessageMarkdown}>
            {message.content}
          </Markdown>
        </Group>
      </Flex>
    </Flex>
  );
};

const UserMessageDisplay = ({ message }: { message: Message }) => {
  return (
    <Flex justify="flex-end">
      <Paper shadow="none" bg="var(--mb-color-border)" maw="15rem" p=".75rem">
        <Text lh="1.35rem">{message.content}</Text>
      </Paper>
    </Flex>
  );
};

const MessageDisplay = ({ message }: { message: Message }) => {
  return match(message.author)
    .with("llm", () => <AIMessageDisplay message={message} />)
    .with("user", () => <UserMessageDisplay message={message} />)
    .exhaustive();
};

const Messages = ({ messages }: { messages: Message[] }) => {
  return (
    <Stack spacing="lg" pb="7rem">
      {messages.map((message, index) => (
        <MessageDisplay key={index} message={message} />
      ))}
    </Stack>
  );
};

// {"dataset_query":{"database":8,"type":"query","query":{"source-table":"card__256"}},"display":"line","displayIsLocked":true,"parameters":[],"visualization_settings":{"table.pivot_column":"year_being_forecast","table.cell_column":"month_of_forecast","graph.dimensions":["month_of_forecast"],"graph.series_order_dimension":null,"graph.series_order":null,"graph.metrics":["forecast_percent_change"]},"original_card_id":283,"type":"question"}
