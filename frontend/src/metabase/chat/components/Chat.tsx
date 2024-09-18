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
import _ from "underscore";

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
import type { FieldReference } from "metabase-types/api";

import Styles from "./Chat.module.css";
import { useMessages } from "./hooks/use-messages";
import type { Message, QueryField } from "./types";
import { getColumnsWithSampleValues, getLLMResponse } from "./utils";

export const Chat = ({
  scrollableStackRef,
  setWidgetOpened,
}: {
  scrollableStackRef: React.RefObject<HTMLDivElement>;
  setWidgetOpened: Dispatch<SetStateAction<boolean>>;
}) => {
  const { currentlyViewedQuestion: question } = (window as any)._chatHacks;

  const questionData = useSelector(getRawSeries);

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
  const fields = useMemo(
    () =>
      question._card.result_metadata
        .filter(field => field.field_ref)
        .map(field => [
          ...([
            field.field_ref?.[0],
            // Concatenate the id with the field name
            `${field.field_ref?.[1]}.${field.display_name}`,
            ...(field.field_ref as FieldReference)?.slice(2),
          ] as FieldReference),
          {
            name: field.name,
            display_name: field.display_name,
            base_type: field.base_type,
          },
        ]) as QueryField[],
    [question],
  );

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
      const systemPrompt = `Your name is Metabot.

      * Title of the currently viewed question: ${question.displayName()}.
      *
      * JSON for the currently viewed question: ${JSON.stringify(query)}.

      * JSON for the question's fields: ${JSON.stringify(fields)}.

      * Sample values for each field: ${fieldsWithSampleValues}.

      * JSON for the question's visualization settings: ${JSON.stringify(
        visualizationSettings,
      )}
      `;
      let { tool_output, assistant_output: response } = await getLLMResponse(
        `${content}

        ${systemPrompt}`,
        systemPrompt,
        fields,
      );
      let completeNewQuery = null;

      if (tool_output) {
        const newQuery = JSON.parse(tool_output);
        // If the filter is an "and" with only one clause, remove the "and"
        if (
          newQuery.query.filter[0][0] === "and" &&
          newQuery.query.filter[0].length === 2
        ) {
          newQuery.query.filter = newQuery.query.filter[0][1];
        }

        completeNewQuery = {
          dataset_query: {
            ...query,
            ...newQuery,
            query: {
              ...("query" in query ? query.query : {}),
              ...newQuery.query,
            },
          },
          display: newQuery.display,
        };
        //const { adhocQuestionURL } = adhockifyURL(completeNewQuery);

        const { assistant_output: proseResponse } = await getLLMResponse(
          `You are an excellent author of website copy. You know the currently viewed question. Here is a modified version of that question: ${JSON.stringify(
            completeNewQuery,
          )}. Provide text for a link that leads from the current question to the modified question. It should be a short, descriptive, specific phrase in sentence case. Do not add quotation marks around the phrase. Just provide the phrase itself with no other text.`,
          systemPrompt,
        );
        //response = [${proseResponse}](${adhocQuestionURL})`;
        response = proseResponse;
      }
      addMessage({
        content: response,
        author: "llm",
        newQuery: completeNewQuery,
      });

      setIsAwaitingLLMResponse(false);
    };
    sendMessageToLLM();
  }, [
    addMessage,
    fields,
    fieldsWithSampleValues,
    messages,
    query,
    question,
    scrollMessagesToBottom,
    scrollableStackRef,
    setIsAwaitingLLMResponse,
    visualizationSettings,
  ]);

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
            addMessage={addMessage}
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
            >{t`Clear chat`}</Button>
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
