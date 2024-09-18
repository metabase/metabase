import {
  type Dispatch,
  type SetStateAction,
  createRef,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import Markdown from "metabase/core/components/Markdown";
import MetabotLogo from "metabase/core/components/MetabotLogo";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { updateQuestion } from "metabase/query_builder/actions";
import { getRawSeries } from "metabase/query_builder/selectors";
import {
  Box,
  Button,
  Flex,
  Group,
  Icon,
  Loader,
  Paper,
  Popover,
  Stack,
  Text,
  Textarea,
  Tooltip,
} from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import Styles from "./Chat.module.css";
import { useMessages } from "./hooks/use-messages";
import type { Message } from "./types";
import { getColumnsWithSampleValues, getJsonSchemaForFilters } from "./utils";
import { useMetabotAgentTool } from "./hooks/useMetabotAgentTool";

import { getToolSpec } from "metabase/query_builder/components/view/sidebars/QuestionInfoSidebar/constants/agent-tools-spec";
import { Field } from "metabase-types/api";

export const Chat = ({
  scrollableStackRef,
  setWidgetOpened,
}: {
  scrollableStackRef: React.RefObject<HTMLDivElement>;
  setWidgetOpened: Dispatch<SetStateAction<boolean>>;
}) => {
  const { currentlyViewedQuestion: question } = (window as any)._chatHacks;

  const questionData = useSelector(getRawSeries);

  const { runAgentAction } = useMetabotAgentTool();

  const query = question._card.dataset_query;
  const visualizationSettings = question._card.visualization_settings;

  const { messages, clearMessages, addMessage } = useMessages();

  const scrollMessagesToBottom = useCallback(() => {
    scrollableStackRef.current?.scrollTo({
      top: scrollableStackRef.current?.scrollHeight + 1000,
    });
  }, [scrollableStackRef]);

  const [isAwaitingLLMResponse, setIsAwaitingLLMResponse] = useState(false);

  useEffect(() => {
    scrollMessagesToBottom();
  }, [isAwaitingLLMResponse, scrollMessagesToBottom]);

  const data = questionData[0]?.data;
  const { cols, rows } = data;
  const fieldsWithSampleValues = useMemo(() => {
    return getColumnsWithSampleValues(cols, rows);
  }, [cols, rows]);

  // So that the LLM has better information, we're going to concatenate the id
  // with the field name and remove this name later.

  const handleAddMessage = async (message: Message) => {
    addMessage(message);

    const userMessage = message.content;
    console.log(`[user] ${userMessage}`);

    setIsAwaitingLLMResponse(true);

    const table = question.metadata().table(question.legacyQueryTableId());

    const fields = table?.fields?.map(field => ({
      id: field.id,
      name: field.name,
      display_name: field.display_name,
      base_type: field.base_type,
      description: field.description,
    }));

    // <system>
    //   provide only one tool call per message for the show/hide columns tool. try
    //   to batch multiple tool calls when possible. the function call must only
    //   use the field's name field.
    // </system>;

    const jsonSchemaForFilters = getJsonSchemaForFilters(
      table.fields as Field[],
    );
    const jsonSchemaForFiltersStringified =
      JSON.stringify(jsonSchemaForFilters);

    console.log(
      "jsonSchemaForFiltersStringified",
      jsonSchemaForFiltersStringified,
    );

    const prompt = `
      <context>
        table id: ${question._card.dataset_query.database}.
        table name: ${table?.name}.
        table display name: ${table?.display_name}.
        available fields: ${JSON.stringify(fields)}.
      </context>

      <json_schema>
      ${jsonSchemaForFiltersStringified}
      </json_schema>

      <user_ask>
        ${userMessage}
      </user_ask>
    `;

    console.log(`Prompt:`, prompt);

    const nextMessages = [
      // ...messages.map(m => ({
      //   content: m.content,
      //   role: m.author === "llm" ? "assistant" : "user",
      // })),
      {
        content: prompt,
        role: "user",
      },
    ];

    const results = await fetch(`http://0.0.0.0:8000/experimental/viz-agent/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: nextMessages,
        tools: getToolSpec(table?.fields as Field[]),
      }),
    });

    const json = await results.json();
    const { content: agentResponse, tool_calls } = json.message;

    addMessage({
      content: agentResponse,
      author: "llm",
      // newQuery: completeNewQuery,
    });

    for (const toolCall of tool_calls) {
      await runAgentAction(toolCall);
    }

    setIsAwaitingLLMResponse(false);
    scrollMessagesToBottom();
  };

  if (!data) {
    return null;
  }

  return (
    <Box pos="relative">
      <Flex
        justify="center"
        align="center"
        w="5rem"
        className={Styles.ChatNav}
        pos="sticky"
        top={0}
        left="calc(100% - 5rem)"
        gap="xs"
      >
        <ChatMenu clearMessages={clearMessages} />
        <ChatCollapse collapse={() => setWidgetOpened(false)} />
      </Flex>
      <Stack
        spacing="sm"
        p="1rem"
        data-testid="edit-viz-page"
        pos="relative"
        justify="flex-end"
      >
        <Messages messages={messages} question={question} />
        {isAwaitingLLMResponse && (
          <AIMessageDisplay
            question={question}
            message={{
              author: "llm",
              content: t`...`,
            }}
          ></AIMessageDisplay>
        )}
      </Stack>
      <Box
        pos="sticky"
        w="calc(100% - 1rem)"
        bg="linear-gradient(to bottom, transparent, white 75%)"
        bottom={0}
      >
        <Box p="1rem" pr="0">
          <WriteMessage
            isAwaitingLLMResponse={isAwaitingLLMResponse}
            addMessage={handleAddMessage}
          />
        </Box>
      </Box>
    </Box>
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

const AIMessageDisplay = ({
  message,
  question,
}: {
  message: Message;
  question: Question;
}) => {
  const markdown = (
    <Markdown linkTarget="" className={Styles.AIMessageMarkdown}>
      {message.content}
    </Markdown>
  );
  return (
    <Flex justify="flex-start">
      <Stack maw="100%" spacing="xs">
        <Group noWrap align="flex-start" spacing="sm">
          <MetabotLogo style={{ width: "1.5rem" }} />
          {message.newQuery ? (
            <LoadNewQuestionButton message={message} question={question}>
              {markdown}
            </LoadNewQuestionButton>
          ) : (
            markdown
          )}
        </Group>
      </Stack>
    </Flex>
  );
};

const LoadNewQuestionButton = ({
  message,
  question,
  children,
}: {
  message: Message;
  question: Question;
  children: React.ReactNode;
}) => {
  const dispatch = useDispatch();
  return (
    <Tooltip label={children}>
      <Button
        px="md"
        py="xs"
        variant="default"
        onClick={() => {
          const nextQuestion = question.setDatasetQuery(
            message.newQuery.dataset_query,
          );
          dispatch(updateQuestion(nextQuestion, { run: true }));
        }}
      >
        {children}
      </Button>
    </Tooltip>
  );
};

const UserMessageDisplay = ({ message }: { message: Message }) => {
  return (
    <Flex justify="flex-end">
      <Paper shadow="none" bg="var(--mb-color-brand)" maw="15rem" p=".75rem">
        <Text c="#fff" lh="1.35rem">
          {message.content}
        </Text>
      </Paper>
    </Flex>
  );
};

const MessageDisplay = ({
  message,
  question,
}: {
  message: Message;
  question: Question;
}) => {
  return match(message.author)
    .with("llm", () => (
      <AIMessageDisplay message={message} question={question} />
    ))
    .with("user", () => <UserMessageDisplay message={message} />)
    .exhaustive();
};

const Messages = ({
  messages,
  question,
}: {
  messages: Message[];
  question: Question;
}) => {
  return (
    <Stack spacing="lg" pb="2rem">
      {messages.map((message, index) => (
        <MessageDisplay key={index} message={message} question={question} />
      ))}
    </Stack>
  );
};

const ChatMenu = ({ clearMessages }: { clearMessages: () => void }) => {
  const [opened, setOpened] = useState(false);
  return (
    <Popover
      position="bottom-end"
      offset={0}
      opened={opened}
      closeOnClickOutside
    >
      <Popover.Target>
        <Button
          styles={{
            label: {
              display: "flex",
              justifyContent: "center",
              align: "center",
            },
          }}
          mt="xs"
          px="sm"
          py="xs"
          c="#000"
          variant="subtle"
          onClick={() => setOpened(o => !o)}
          className={Styles.ChatNavButton}
        >
          <Icon name="ellipsis" />
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Paper miw="8rem">
          <Stack>
            <Button
              styles={{ inner: { justifyContent: "flex-start" } }}
              onClick={() => {
                clearMessages();
                setOpened(false);
              }}
            >{t`Clear chat history`}</Button>
          </Stack>
        </Paper>
      </Popover.Dropdown>
    </Popover>
  );
};

const ChatCollapse = ({ collapse }: { collapse: () => void }) => {
  return (
    <Tooltip label={t`Minimize chat`}>
      <Button
        styles={{
          label: {
            display: "flex",
            justifyContent: "center",
            align: "center",
          },
        }}
        mt="xs"
        px="sm"
        py="xs"
        c="#000"
        variant="subtle"
        onClick={collapse}
        className={Styles.ChatNavButton}
      >
        <Icon name="chevrondown" />
      </Button>
    </Tooltip>
  );
};
