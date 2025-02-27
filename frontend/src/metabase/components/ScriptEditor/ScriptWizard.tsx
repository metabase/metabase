/* eslint-ignore no-restricted-imports -- for hackathon velocity */

import { Stack, Text, Tooltip, Flex, Icon, Button, Title } from "metabase/ui";
import { t } from "ttag";
import { ScriptEditor } from "./ScriptEditor";
import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ScriptLibrary } from "./ScriptLibrary";
import type { Script } from "./types";
import { AffixWithCloseButton } from "./AffixWithCloseButton";
import { CodeEditor } from "./CodeEditor";
import { defaultScripts } from "./defaultScripts";
import { Ellipsified } from "metabase/core/components/Ellipsified";

export const ScriptWizard = ({
  setShowScriptWizard,
}: {
  setShowScriptWizard: Dispatch<SetStateAction<boolean>>;
}) => {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [currentScriptId, setCurrentScriptId] = useState<number | null>(null);

  const [shouldShowGuide, setShouldShowGuide] = useState(false);
  const [shouldShowLLMPrompt, setShouldShowLLMPrompt] = useState(false);

  useEffect(function setOpenAIApiKey() {
    const stored = window.localStorage.getItem("OPENAI_API_KEY");
    if ((window as any).OPENAI_API_KEY) {
      window.localStorage.setItem(
        "OPENAI_API_KEY",
        (window as any).OPENAI_API_KEY,
      );
    } else if (stored) {
      (window as any).OPENAI_API_KEY = stored;
    }
  }, []);

  useEffect(function getScripts() {
    let ret = [];
    try {
      const storedScriptsAsJSON =
        localStorage.getItem("metabase.scripts") || "";
      ret = JSON.parse(storedScriptsAsJSON) || [];
    } catch (e) {
      console.error("Error parsing scripts", e);
    }
    if (!ret.length) {
      ret = defaultScripts;
    }
    setScripts(ret);
  }, []);

  useEffect(
    function storeScripts() {
      localStorage.setItem("metabase.scripts", JSON.stringify(scripts));
    },
    [scripts],
  );

  const openNewScript = useCallback(() => {
    setScripts(scripts => {
      setCurrentScriptId(scripts.length);
      return [
        ...scripts,
        {
          id: scripts.length,
          code: "// Write your script here",
          name: "Untitled",
        },
      ];
    });
  }, []);

  const modifyCurrentScript = useCallback(
    (newCode: string) => {
      if (currentScriptId === undefined) {
        console.error("Tried to modify script but there is no current script");
        return;
      }
      const newScripts = scripts.map(script =>
        script.id === currentScriptId ? { ...script, code: newCode } : script,
      );
      setScripts(newScripts);
    },
    [currentScriptId, scripts],
  );

  const currentScript = useMemo(
    () => scripts.find(s => s.id === currentScriptId),
    [scripts, currentScriptId],
  );

  const renameCurrentScript = useCallback(() => {
    if (currentScriptId === undefined) {
      console.error("Tried to rename script but there is no current script");
      return;
    }
    const newName = prompt("Enter new name", currentScript?.name);
    if (newName) {
      const newScripts = scripts.map(script =>
        script.id === currentScriptId ? { ...script, name: newName } : script,
      );
      setScripts(newScripts);
    }
  }, [currentScriptId, scripts, currentScript?.name]);

  return (
    <AffixWithCloseButton
      paperProps={{
        h: "90dvh",
        w: "45rem",
        style: { overflowY: "auto" },
      }}
      affixProps={{
        bottom: "1rem",
        right: "1rem",
      }}
      onClose={() => setShowScriptWizard(false)}
    >
      <Flex
        align="center"
        gap={0}
        style={{ borderBottom: "1px solid rgba(0,0,0,.1)" }}
      >
        {currentScriptId !== undefined && (
          <Tooltip label={t`Back to Script Library`}>
            <Button
              p="sm"
              variant="transparent"
              onClick={() => setCurrentScriptId(null)}
              pos="relative"
              top="2px"
            >
              <Icon name="chevronleft" />
            </Button>
          </Tooltip>
        )}
        <Title
          fw="bold"
          order={3}
          p="md"
          onClick={currentScript ? renameCurrentScript : undefined}
        >
          <Ellipsified style={{ width: "25rem" }}>
            {currentScript
              ? t`Script:` + ` ${currentScript.name}`
              : t`Script Library`}
          </Ellipsified>
        </Title>
        {!currentScript && (
          <Button
            onClick={() => openNewScript()}
            variant="subtle"
            bg="brand-light"
            h="1.75rem"
            ms="auto"
            mr="3rem"
          >
            {t`New script`}
          </Button>
        )}
        {currentScript && (
          <Button
            onClick={() => setShouldShowGuide(show => !show)}
            variant="subtle"
            bg="brand-light"
            h="1.75rem"
            ms="1rem"
          >
            {t`Guide`}
          </Button>
        )}
        {currentScript && (
          <Button
            variant="subtle"
            bg="brand-light"
            h="1.75rem"
            onClick={() => setShouldShowLLMPrompt(show => !show)}
            ms="sm"
          >
            <Icon name="ai" />
          </Button>
        )}
      </Flex>
      {shouldShowGuide && (
        <ScriptGuide onClose={() => setShouldShowGuide(false)} />
      )}
      {currentScript ? (
        <ScriptEditor
          modifyCurrentScript={modifyCurrentScript}
          script={currentScript}
          setScripts={setScripts}
          shouldShowLLMPrompt={shouldShowLLMPrompt}
        />
      ) : (
        <ScriptLibrary
          scripts={scripts}
          setScripts={setScripts}
          setCurrentScriptId={setCurrentScriptId}
        />
      )}
    </AffixWithCloseButton>
  );
};

const ScriptGuide = ({ onClose }: { onClose: () => void }) => {
  return (
    <AffixWithCloseButton
      paperProps={{ h: "90dvh", w: "30rem" }}
      affixProps={{ bottom: "1rem", right: "47rem" }}
      onClose={onClose}
    >
      <Flex
        align="center"
        p="md"
        style={{ borderBottom: "1px solid rgba(0,0,0,.1)" }}
      >
        <Title order={3}>{t`Script guide`}</Title>
      </Flex>
      <Stack p="1rem">
        <Stack gap="xs">
          <Text fw="bold">Retrieve objects</Text>
          <CodeEditor
            script={{
              code: `const collections = await Collections.all();
const questions = await Questions.all();`,
            }}
          />
        </Stack>
        <Stack gap={0}>
          <Text fw="bold">Save changes to objects</Text>
          <CodeEditor
            script={{
              code: `const collections = await Collections.all();
const c = collections[0];
c.name += " updated";
await c.save();`,
            }}
          />
        </Stack>
        <Stack gap={0}>
          <Text fw="bold">Display output</Text>
          <CodeEditor
            script={{
              code: `showTextInModal('Title', 'Content');`,
            }}
          />
        </Stack>
        <Stack gap={0}>
          <Text fw="bold">Open question picker</Text>
          <CodeEditor
            script={{
              code: `pickQuestion("Pick a question", (question) => {
  // Do something with the selected question
});`,
            }}
          />
        </Stack>
      </Stack>
    </AffixWithCloseButton>
  );
};
