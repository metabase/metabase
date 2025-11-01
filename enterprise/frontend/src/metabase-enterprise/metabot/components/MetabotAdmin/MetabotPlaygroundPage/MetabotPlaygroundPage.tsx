import { useState } from "react";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { Box, Button, Flex, Stack, Text, TextInput } from "metabase/ui";
import { MetabotChatEditor } from "metabase-enterprise/metabot/components/MetabotChat/MetabotChatEditor/MetabotChatEditor";

import { useBots, usePlaygroundSupport, usePlaygrounds } from "./hooks";
import type { BotConfig } from "./types";

export function MetabotPlaygroundAdminPage() {
  const { bots, resetBots, addBot, updateBot, removeBot } = useBots();

  const playgroundSupport = usePlaygroundSupport();
  const { playgrounds, resetPlaygrounds, submitPrompt, iframesContainerRef } =
    usePlaygrounds(bots);

  const handleReset = () => {
    resetPlaygrounds();
    resetBots();
  };

  return (
    <AdminSettingsLayout
      fullWidth
      sidebar={
        <PlaygroundNav
          bots={bots}
          onAddBot={(bot: BotConfig) => {
            handleReset();
            addBot(bot);
          }}
          onUpdateBot={(index: number, bot: BotConfig) => {
            handleReset();
            updateBot(index, bot);
          }}
          onRemoveBot={removeBot}
          onSubmitPrompt={submitPrompt}
          onReset={handleReset}
        />
      }
    >
      <ErrorBoundary>
        <Stack p="md" gap="lg" ref={iframesContainerRef}>
          {!playgroundSupport.isSupported && (
            <Flex justify="center" align="center">
              <Text size="lg" c="text-light">
                {playgroundSupport.isEmbeddingEnabled
                  ? "Enable interactive embedding and add current host to authorized origins."
                  : "Add current host to authorized origins for interactive embedding."}
              </Text>
            </Flex>
          )}
          {playgroundSupport.isSupported && (
            <>
              {!playgrounds.length && (
                <Flex justify="center" align="center">
                  <Text size="lg" c="text-light">
                    {t`Submit a prompt`}
                  </Text>
                </Flex>
              )}
              {playgrounds.map((playground, i) => {
                return (
                  <Stack key={i} gap="xs">
                    <Text fw="bold">
                      {t`Profile:`}{" "}
                      {playground.bot.profile || t`<default profile>`}
                    </Text>
                    <iframe {...playground.iframe} />
                  </Stack>
                );
              })}
            </>
          )}
        </Stack>
      </ErrorBoundary>
    </AdminSettingsLayout>
  );
}

interface PlaygroundNavProps {
  bots: BotConfig[];
  onAddBot: (bot: BotConfig) => void;
  onUpdateBot: (index: number, bot: BotConfig) => void;
  onRemoveBot: (index: number) => void;
  onSubmitPrompt: (value: string) => void;
  onReset: () => void;
}

function PlaygroundNav({
  onAddBot,
  onUpdateBot,
  onRemoveBot,
  bots,
  onSubmitPrompt,
  onReset,
}: PlaygroundNavProps) {
  const [input, setInput] = useState("");
  const [newProfile, setNewProfile] = useState("");

  return (
    <Stack w="24rem" p="md" gap="md">
      <Flex justify="space-between">
        <Text size="xl" fw="bold">
          {t`Metabot Playground`}
        </Text>
        <Button onClick={onReset}>{t`Reset`}</Button>
      </Flex>
      <Stack gap="sm">
        <Text fw="bold">{t`Profiles`}</Text>
        {bots.map((bot, i) => (
          <Flex gap="sm" key={i}>
            <TextInput
              w="100%"
              value={bot.profile}
              placeholder={t`<default profile>`}
              onChange={(e) =>
                onUpdateBot(i, { ...bot, profile: e.target.value })
              }
            />
            <Button flex="1 0 auto" onClick={() => onRemoveBot(i)}>
              {t`Remove`}
            </Button>
          </Flex>
        ))}
        <Flex gap="sm">
          <TextInput
            value={newProfile}
            placeholder={t`Add new profile`}
            onChange={(e) => setNewProfile(e.target.value)}
            w="100%"
          />
          <Button
            flex="1 0 auto"
            onClick={() => {
              setNewProfile("");
              onAddBot({ profile: newProfile, debug: true });
            }}
          >
            {t`Add`}
          </Button>
        </Flex>
      </Stack>
      <Stack gap="sm">
        <Text fw="bold">{t`Prompt`}</Text>
        <Box bd="1px solid var(--mb-color-border)" bdrs="sm">
          <MetabotChatEditor
            value={input}
            onChange={setInput}
            onSubmit={() => {
              onSubmitPrompt(input);
              setInput("");
            }}
          />
        </Box>
      </Stack>
    </Stack>
  );
}
