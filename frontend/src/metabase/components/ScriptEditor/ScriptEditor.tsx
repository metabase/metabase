/* eslint-ignore no-restricted-imports -- for hackathon velocity */

import { QuestionPickerModal } from "metabase/common/components/QuestionPicker";

import {
  Title,
  Text,
  Paper,
  Button,
  Flex,
  Stack,
  Icon,
  Loader,
  Modal,
  Tooltip,
  TextInput,
} from "metabase/ui";
import S from "./ScriptEditor.module.css";
import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { t } from "ttag";
import { match } from "ts-pattern";
import { Script } from "./types";
import { Card } from "metabase-types/api";
import Markdown from "metabase/core/components/Markdown";
import { CodeEditor } from "./CodeEditor";
import { useSetting } from "metabase/common/hooks";
import { Question } from "../../../scripting/simple-api";

type OnPickQuestion = (question: Card | Question) => Promise<void>;

type PromiseMetadata = {
  value: any;
  status: string;
  description: string;
};

export const ScriptEditor = ({
  modifyCurrentScript,
  setScripts,
  script,
  shouldShowLLMPrompt,
}: {
  script: Script;
  modifyCurrentScript: (newCode: string) => void;
  setScripts: Dispatch<SetStateAction<Script[]>>;
  shouldShowLLMPrompt: boolean;
}) => {
  // Promises are tracked in a global variable, window.trackedPromises. We poll this variable and update
  // this local state variable to trigger a re-render.
  const [jobs, setJobs] = useState<Map<number, PromiseMetadata>>(new Map());

  const [shouldShowModal, setShouldShowModal] = useState(false);
  const [modalText, setModalText] = useState<string | null>(null);
  const [modalTitle, setModalTitle] = useState<string | null>(null);
  const [shouldShowQuestionPicker, setShouldShowQuestionPicker] =
    useState(false);
  const [onPickQuestion, setOnPickQuestion] = useState<any | undefined>(
    undefined,
  );
  const [questionPickerTitle, setQuestionPickerTitle] = useState(
    t`Pick a question`,
  );

  // Let's keep track of the current code shown in the editor. This code may or may not have been saved.
  const [currentCode, setCurrentCode] = useState(script.code);

  useEffect(() => {
    const showTextInModal = (title: string, text: string) => {
      setModalTitle(title);
      setModalText(text);
      setShouldShowModal(true);
    };
    const pickQuestion = (
      questionPickerTitle: string,
      onPickQuestion: OnPickQuestion,
    ) => {
      setQuestionPickerTitle(questionPickerTitle);
      setShouldShowQuestionPicker(true);
      const selectQuestion = async (questionAsCard: Card) => {
        const question = new Question(questionAsCard);
        setShouldShowQuestionPicker(false);
        await onPickQuestion(question);
      };
      setOnPickQuestion(
        // We pass a callback here with the function as the return value. If we
        // just pass onPickQuestion itself, it will be interpreted as a
        // functional setState invocation
        () => selectQuestion,
      );
    };
    Object.assign(window as any, { showTextInModal, pickQuestion });
    return () => {
      (window as any).trackedPromises.clear();
    };
  }, []);

  // Poll the global variable to update the local state
  useEffect(
    () => {
      const interval = setInterval(() => {
        const copy = new Map();
        for (const [key, value] of (window as any).trackedPromises.entries()) {
          copy.set(key, value);
        }
        setJobs(copy);
      }, 300);
      return () => clearInterval(interval);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const openaiApiKey = useSetting("openai-api-key");

  const run = useCallback((script: string) => {
    (window as any).trackedPromises.clear();

    // eslint-ignore no-unused-vars
    const dayjs = window.Scripting.dayjs;
    const Collections = window.Scripting.Collections;
    const Questions = window.Scripting.Questions;
    const OpenAI = window.Scripting.OpenAI;
    const showTextInModal = window.showTextInModal;

    const askChatGPT = async prompt => {
      const openai = new OpenAI({
        apiKey: window.OPENAI_API_KEY,
        dangerouslyAllowBrowser: true,
      });

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          {
            role: "user",
            content: `${prompt}. If the preceding prompt requests a string, just return the string, nothing else.`,
          },
        ],
        store: true,
      });

      return completion.choices[0].message.content;
    };

    // const openai = new OpenAI({
    //   apiKey: openaiApiKey,
    //   dangerouslyAllowBrowser: true,
    // });

    const wrappedScript = `(async function() {
      try {
        ${script}
      }
      catch (e) {
        console.error(e);
      }
      finally {
        console.log('DONE');
      }
    })();`;
    eval(wrappedScript);
  }, []);

  const editorRef = useRef<HTMLDivElement | null>(null);
  const areAllJobsComplete =
    [...jobs.entries()].filter(([_id, p]) => p.status === "pending").length ===
    0;

  return (
    <Stack justify="space-between">
      {shouldShowModal && (
        <Modal
          withOverlay={false}
          opened
          padding="2rem"
          onClose={() => setShouldShowModal(false)}
          title={modalTitle}
        >
          <Text fz="1rem" lh="1.25rem" className={S.MarkdownInModal}>
            <Markdown>{modalText || ""}</Markdown>
          </Text>
        </Modal>
      )}
      {shouldShowQuestionPicker && onPickQuestion && (
        <QuestionPickerModal
          title={questionPickerTitle}
          models={["card", "dataset", "metric"]}
          onChange={async val => {
            await onPickQuestion?.(val);
          }}
          onClose={() => setShouldShowQuestionPicker(false)}
        />
      )}
      {shouldShowLLMPrompt && (
        <LLMPrompt modifyCurrentScript={modifyCurrentScript} />
      )}
      <CodeEditor
        key={script.code}
        h={jobs.size ? "41dvh" : shouldShowLLMPrompt ? "69dvh" : "76.5dvh"}
        script={script}
        ref={editorRef}
        onChange={setCurrentCode}
      />
      <Flex
        justify="space-between"
        p="md"
        pb={0}
        style={{ borderTop: "1px solid rgba(0,0,0, .1)" }}
      >
        <Flex gap="1rem">
          <Button
            variant="light"
            miw="5rem"
            onClick={() => {
              modifyCurrentScript(currentCode);
            }}
          >
            {t`Save`}
          </Button>
          <Button
            miw="5rem"
            variant="light"
            onClick={() => {
              const script = editorRef.current?.innerText;
              if (!script) {
                return;
              }
              run(script);
            }}
          >
            <Flex gap="xs">
              {areAllJobsComplete ? (
                <>
                  <Icon name="play" />
                  {t`Run`}
                </>
              ) : (
                <Loader classNames={{ root: S.ScriptRunningIndicator }} />
              )}
            </Flex>
          </Button>
        </Flex>
        <Tooltip
          style={{ justifySelf: "flex-end" }}
          label={t`Delete this script`}
        >
          <Button
            variant="subtle"
            onClick={() => {
              setScripts(scripts =>
                scripts.filter((s: Script) => s.id !== script.id),
              );
            }}
          >
            <Flex gap="xs">
              <Icon name="trash" />
            </Flex>
          </Button>
        </Tooltip>
      </Flex>
      {jobs.size > 0 && (
        <Stack p="md" pt={0}>
          <Paper bg="#f9f9f9" shadow="none" bd="1px solid rgba(0,0,0, .1)">
            <Stack p="md" gap="sm" h="34dvh" style={{ overflowY: "auto" }}>
              <Title order={3}>{t`Jobs`}</Title>
              {[...jobs.entries()].map(([id, promiseMetadata]) => (
                <Paper
                  shadow="none"
                  bd="1px solid rgba(0,0,0,.1)"
                  p="sm"
                  w="100%"
                  key={id}
                >
                  <Flex gap="sm" align="center">
                    <Flex
                      w="2rem"
                      align="center"
                      justify="center"
                      pos="relative"
                      top="2px"
                    >
                      {match(promiseMetadata.status)
                        .with("pending", () => (
                          <Loader
                            classNames={{
                              root: S.JobRunningIndicator,
                            }}
                            size={16}
                            color="#666"
                          />
                        ))
                        .with("resolved", () => <Icon c="#0a0" name="check" />)
                        .with("rejected", () => <Icon c="#c00" name="close" />)
                        .otherwise(() => promiseMetadata.status)}
                    </Flex>
                    <Text fw="bold">{promiseMetadata.description}</Text>
                  </Flex>
                </Paper>
              ))}
            </Stack>
          </Paper>
        </Stack>
      )}
    </Stack>
  );
};

const LLMPrompt = ({
  modifyCurrentScript,
}: {
  modifyCurrentScript: (newCode: string) => void;
}) => {
  const OpenAI = (window as any).Scripting.OpenAI;

  const askChatGPT = useCallback(
    async (prompt: string) => {
      const openai = new OpenAI({
        apiKey: (window as any).OPENAI_API_KEY,
        dangerouslyAllowBrowser: true,
      });

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          {
            role: "user",
            content: prompt,
          },
        ],
        store: true,
      });

      return completion.choices[0].message.content;
    },
    [OpenAI],
  );

  const [input, setInput] = useState("");

  const sendPrompt = useCallback(async () => {
    const prompt = `You are an author of scripts that automate actions in Metabase.

I'll give you some examples of scripts that modify entities inside a Metabase instance. Then I'll ask you to write a new script to accomplish a set goal, modeling your script closely on the examples given.

// Script 1. Append to collection names
const yesterday = dayjs().subtract(1, "day");
const sixMonthsAgo = dayjs().subtract(6, "month");
const collections = await Collections.all();

const appendWhat = prompt("What do you want to append to the collection names?");
const updates = collections
    .filter(c => c.created_at.isAfter(sixMonthsAgo))
    .map(c => {
      c.name = c.name += appendWhat;
      return c.save();
    });

await Promise.all(updates);

// Script 2. Delete collections created in the last N days
const howManyDaysAgo = prompt('Delete collections created since this many days ago');
const nDaysAgo = dayjs().subtract(howManyDaysAgo, "day");
const collections = await Collections.all();

const deletions = collections
    .filter(c => c.created_at.isAfter(nDaysAgo))
    .map(c => c.delete());

await Promise.all(deletions);

// Script 3. Find/replace
const questions = await Questions.all();
const someQuestions = questions.filter(q => q.collection_id === 94);

const find = prompt('Find:');
const replace = prompt('Replace with:');
for (const q of someQuestions) {
  q.name = q.name.replace(find, replace);
  await q.save();
}

// Script 4. Send a prompt to ChatGPT
const corrected = await askChatGPT(\`Return the provided string with any typographic errors corrected. Return just the string, nothing else. The string: \${str}\`)

Given these examples, please write a script that does the following: ${input}. Just return the script and no other text. Do not surround the script with markdown


// Script 5. Pick a question using the Question Picker. Note: pickQuestion is not an async function. But if the callback needs to run an async function, it can be made async.
pickQuestion("Pick a question", (question) => {
  // Do something with the selected question
  q.name += " updated";
  await q.save();
});

// Script 6. Show output.
pickQuestion("Pick a question", (question) => {
  showTextInModal('Output', \`The question's name is \${question.name}\`);
});
`;

    const response = await askChatGPT(prompt);
    modifyCurrentScript(response);
  }, [input, modifyCurrentScript, askChatGPT]);

  return (
    <Flex
      bg="bg-light"
      gap="xs"
      p="sm"
      style={{ borderBottom: "1px solid rgba(0,0,0,.1)" }}
    >
      <TextInput
        w="100%"
        onChange={e => setInput(e.target.value)}
        placeholder={t`Prompt the LLM`}
        autoFocus
      />
      <Tooltip label="Send">
        <Button onClick={async () => await sendPrompt()}>
          <Icon name="arrow_down" />
        </Button>
      </Tooltip>
    </Flex>
  );
};
