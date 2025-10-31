// TODO: updating a profile name doesn't do anyting currently
import ErrorBoundary from "metabase/ErrorBoundary";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { Box, Stack, TextInput, Text, Button, Flex } from "metabase/ui";
import { useRef, useState } from "react";
import { MetabotChatEditor } from "metabase-enterprise/metabot/components/MetabotChat/MetabotChatEditor/MetabotChatEditor";
import { useSetting } from "metabase/common/hooks";

type BotConfig = { profile: string; debug: boolean };

export function MetabotPlaygroundAdminPage() {
  const [firstSubmittedInput, setFirstSubmittedInput] = useState<string>("");

  const iframesRef = useRef<HTMLDivElement | null>(null);

  const handleReset = () => {
    setFirstSubmittedInput("");
  };

  const submitInputToIframes = (input: string) => {
    if (iframesRef.current) {
      [...iframesRef.current.querySelectorAll("iframe")].forEach((iframe) => {
        const dom = iframe.contentDocument || iframe.contentWindow?.document;
        if (dom) {
          const inputEl = dom.querySelector(
            '[data-testid="metabot-chat-input"] [contenteditable]',
          );
          if (inputEl) {
            inputEl.textContent = input;
            inputEl.dispatchEvent(
              new InputEvent("input", {
                bubbles: true,
                cancelable: true,
                data: input,
              }),
            );
            setTimeout(() => {
              const enter = {
                key: "Enter",
                code: "Enter",
                keyCode: 13,
                which: 13,
                bubbles: true,
              };
              inputEl.dispatchEvent(new KeyboardEvent("keydown", enter));
              inputEl.dispatchEvent(new KeyboardEvent("keyup", enter));
            }, 100);
          }
        }
      });
    }
  };

  const handleSubmit = (input: string) => {
    firstSubmittedInput
      ? submitInputToIframes(input)
      : setFirstSubmittedInput(input);
  };

  const styles =
    iframesRef.current && window.getComputedStyle(iframesRef.current);
  const innerWidth =
    iframesRef.current && styles
      ? iframesRef.current.clientWidth -
        parseFloat(styles.paddingLeft) -
        parseFloat(styles.paddingRight)
      : 0;

  const [bots, setBots] = useState<BotConfig[]>([
    { profile: "" /* default profile */, debug: true },
    { profile: "metabot_next", debug: true },
  ]);

  const handleAddBot = (bot: BotConfig) => {
    handleReset();
    setBots((bots) => bots.concat(bot));
  };

  const isInterativeEmbeddingEnabled = useSetting(
    "enable-embedding-interactive",
  );
  const interactiveEmbeddingOrigins =
    useSetting("embedding-app-origins-interactive") ?? "";
  // NOTE: probably not a perfectly correct calculation
  const isValidInteractiveEmbeddingOrigin = interactiveEmbeddingOrigins
    .split(" ")
    .some((url) => {
      return (
        url.split("/").pop() === window.location.host ||
        (url.startsWith("*.") &&
          url.includes(window.location.host.split(".").slice(-2).join(".")))
      );
    });
  const isPlaygroundSupported =
    isInterativeEmbeddingEnabled && isValidInteractiveEmbeddingOrigin;

  return (
    <AdminSettingsLayout
      fullWidth
      sidebar={
        <PlaygroundNav
          bots={bots}
          onAddBot={handleAddBot}
          onRemoveBot={(index) =>
            setBots((bots) => bots.filter((_, i) => i !== index))
          }
          onSubmitPrompt={handleSubmit}
          onReset={handleReset}
        />
      }
    >
      <ErrorBoundary>
        <Stack p="md" gap="lg" ref={iframesRef}>
          {!isPlaygroundSupported && (
            <Flex justify="center" align="center">
              <Text size="lg" c="text-light">
                {isInterativeEmbeddingEnabled
                  ? "Enable interactive embedding and add current host to authorized origins."
                  : "Add current host to authorized origins for interactive embedding."}
              </Text>
            </Flex>
          )}
          {isPlaygroundSupported && (
            <>
              {!firstSubmittedInput && (
                <Flex justify="center" align="center">
                  <Text size="lg" c="text-light">
                    Submit a prompt
                  </Text>
                </Flex>
              )}
              {firstSubmittedInput &&
                bots.map((bot, i) => {
                  let src = `/metabot/new?q=${firstSubmittedInput}`;
                  if (bot.profile) src += `&p=${bot.profile}`;
                  if (bot.debug) src += `&d=true`;

                  return (
                    <Stack key={`bot-${bot.profile}-${i}`} gap="xs">
                      <Text fw="bold">
                        Profile: {bot.profile || "<default profile>"}
                      </Text>
                      <iframe
                        src={src}
                        width={innerWidth + "px"}
                        height={Math.round(innerWidth / 1.5) + "px"}
                      />
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

function PlaygroundNav({
  onAddBot,
  onRemoveBot,
  bots,
  onSubmitPrompt,
  onReset,
}: {
  bots: BotConfig[];
  onAddBot: (bot: BotConfig) => void;
  onRemoveBot: (index: number) => void;
  onSubmitPrompt: (value: string) => void;
  onReset: () => void;
}) {
  const [input, setInput] = useState("Hello world");
  const [newProfile, setNewProfile] = useState("");

  return (
    <Stack w="24rem" p="md" gap="md">
      <Flex justify="space-between">
        <Text size="xl" fw="bold">
          Metabot Playground
        </Text>
        <Button onClick={onReset}>Reset</Button>
      </Flex>
      <Stack gap="sm">
        <Text fw="bold">Profiles</Text>
        {bots.map((bot, i) => (
          <Flex gap="sm" key={bot.profile + i}>
            <TextInput
              w="100%"
              value={bot.profile}
              placeholder="<default profile>"
            />
            <Button flex="1 0 auto" onClick={() => onRemoveBot(i)}>
              Remove
            </Button>
          </Flex>
        ))}
        <Flex gap="sm">
          <TextInput
            value={newProfile}
            placeholder="Add new profile"
            onChange={(e) => setNewProfile(e.target.value)}
            w="100%"
          />
          <Button
            flex="1 0 auto"
            onClick={() => {
              setNewProfile("");
              onAddBot({
                profile: newProfile,
                debug: true,
              });
            }}
          >
            Add
          </Button>
        </Flex>
      </Stack>
      <Stack gap="sm">
        <Text fw="bold">Prompt</Text>
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
