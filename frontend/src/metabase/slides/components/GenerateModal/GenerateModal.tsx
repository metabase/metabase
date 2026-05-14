import { useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { useSearchQuery } from "metabase/api";
import { slidesApi } from "metabase/api/slides";
import { useToast } from "metabase/common/hooks";
import { useDispatch, useSelector } from "metabase/redux";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Icon,
  Modal,
  Stack,
  Text,
  TextInput,
  Textarea,
} from "metabase/ui";
import type { IconName } from "metabase-types/api";

import { type AgentEvent, runAgentStream } from "../../agent-stream";
import { getDeckId, getIsGenerateModalOpen } from "../../selectors";
import { closeGenerateModal, loadDeck } from "../../slides.slice";

import S from "./GenerateModal.module.css";

interface PickedItem {
  id: number;
  model: "card" | "dashboard";
  name: string;
}

interface AgentLogEntry {
  id: string;
  kind: AgentEvent["type"];
  title: string;
  detail?: string;
  payload?: AgentEvent;
}

const layoutLabel = (layout: string) => layout.replace(/_/g, " ");

const eventToLog = (event: AgentEvent): AgentLogEntry | null => {
  switch (event.type) {
    case "thinking":
      return {
        id: `thinking-${event.iteration}`,
        kind: event.type,
        title: t`Thinking…`,
      };
    case "tool_call": {
      const summary = summariseToolCall(event.tool, event.input);
      return {
        id: event.id,
        kind: event.type,
        title: summary.title,
        detail: summary.detail,
        payload: event,
      };
    }
    case "tool_result":
      // Promote tool_result to update the matching tool_call entry instead of a new line — see below.
      return null;
    case "outline":
      return {
        id: `outline-${Date.now()}`,
        kind: event.type,
        title: t`Outline ready`,
        payload: event,
      };
    case "slide_written":
      return {
        id: `slide-${event.index}`,
        kind: event.type,
        title: t`Slide ${event.index} — ${
          (event.slide as { layout?: string })?.layout ?? ""
        }`,
      };
    case "assistant":
      if (!event.text.trim()) {
        return null;
      }
      return {
        id: `assistant-${Date.now()}-${Math.random()}`,
        kind: event.type,
        title: event.text.trim(),
      };
    case "done":
      return {
        id: `done`,
        kind: event.type,
        title: t`Done in ${(event.latency_ms / 1000).toFixed(1)}s`,
      };
    case "saved":
      return null;
    case "error":
      return {
        id: `error-${Date.now()}`,
        kind: event.type,
        title: t`Error: ${event.message}`,
      };
    case "end":
      return null;
  }
};

// Extract a human label from a tool_result so we can swap the "#42" placeholder
// in the matching tool_call entry for something readable.
const resultDetail = (
  tool: string,
  result: Record<string, unknown>,
): string | undefined => {
  if (!result) {
    return undefined;
  }
  switch (tool) {
    case "get_card": {
      const name = (result as { name?: string }).name;
      return name || undefined;
    }
    case "get_dashboard_cards": {
      const dash = (result as { dashboard?: { name?: string } }).dashboard;
      const cards = (result as { cards?: unknown[] }).cards;
      if (dash?.name && cards) {
        return t`${dash.name} — ${cards.length} cards`;
      }
      return dash?.name;
    }
    case "search_metabase": {
      const results = (result as { results?: unknown[] }).results;
      return results ? t`${results.length} results` : undefined;
    }
    default:
      return undefined;
  }
};

const summariseToolCall = (
  tool: string,
  input: Record<string, unknown>,
): { title: string; detail?: string } => {
  switch (tool) {
    case "search_metabase":
      return {
        title: t`Searching your content`,
        detail: t`for "${String(input.query ?? "")}"`,
      };
    case "get_dashboard_cards":
      return {
        title: t`Inspecting dashboard`,
        detail: `#${input.dashboard_id}`,
      };
    case "get_card":
      return {
        title: t`Inspecting card`,
        detail: `#${input.card_id}`,
      };
    case "propose_outline":
      return { title: t`Drafting outline` };
    case "write_slide":
      return {
        title: t`Writing slide ${input.index}`,
        detail: layoutLabel(String(input.layout ?? "")),
      };
    default:
      return { title: tool };
  }
};

const iconForEvent = (kind: AgentEvent["type"]): IconName => {
  switch (kind) {
    case "thinking":
      return "ai";
    case "tool_call":
      return "search";
    case "outline":
      return "list";
    case "slide_written":
      return "check";
    case "assistant":
      return "comment";
    case "done":
      return "check";
    case "error":
      return "warning";
    default:
      return "info";
  }
};

export const GenerateModal = () => {
  const dispatch = useDispatch();
  const isOpen = useSelector(getIsGenerateModalOpen);
  const deckId = useSelector(getDeckId);
  const [sendToast] = useToast();

  const [prompt, setPrompt] = useState("");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<PickedItem[]>([]);

  const trimmed = query.trim();
  const { data: searchData } = useSearchQuery(
    trimmed.length > 0
      ? { q: trimmed, models: ["card", "dashboard"], limit: 6 }
      : ({ skipToken: true } as never),
    { skip: trimmed.length === 0 },
  );

  const searchResults = useMemo(() => {
    const items = searchData?.data ?? [];
    const pickedKeys = new Set(picked.map((p) => `${p.model}:${p.id}`));
    return items.filter(
      (item) =>
        (item.model === "card" || item.model === "dashboard") &&
        !pickedKeys.has(`${item.model}:${item.id}`),
    );
  }, [searchData, picked]);

  const [isStreaming, setIsStreaming] = useState(false);
  const [log, setLog] = useState<AgentLogEntry[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const streamRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll the agent log to the bottom whenever a new event lands so the
  // active step stays visible without the user having to scroll manually.
  useEffect(() => {
    const el = streamRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [log.length]);

  const handleClose = () => {
    if (isStreaming) {
      return;
    }
    setLog([]);
    setPrompt("");
    setQuery("");
    setPicked([]);
    dispatch(closeGenerateModal());
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || !deckId) {
      return;
    }
    const ac = new AbortController();
    abortRef.current = ac;
    setIsStreaming(true);
    setLog([]);

    try {
      await runAgentStream({
        deckId,
        prompt: prompt.trim(),
        dashboardId: picked.find((p) => p.model === "dashboard")?.id,
        cardIds: picked.filter((p) => p.model === "card").map((p) => p.id),
        signal: ac.signal,
        onEvent: (event) => {
          // Some events (tool_result) update an existing entry by id rather
          // than appending a new line — that's how we replace "#15" with
          // "Revenue per quarter" once we know the card name.
          if (event.type === "tool_result") {
            const detail = resultDetail(event.tool, event.result);
            if (detail) {
              setLog((l) =>
                l.map((entry) =>
                  entry.id === event.id ? { ...entry, detail } : entry,
                ),
              );
            }
            return;
          }
          const entry = eventToLog(event);
          if (entry) {
            setLog((l) => [...l, entry]);
          }
        },
      });

      // Pull the final saved deck so the editor sees the agent's writes.
      const refreshed = await dispatch(
        slidesApi.endpoints.getSlides.initiate(
          { id: deckId },
          { forceRefetch: true },
        ),
      ).unwrap();
      dispatch(
        loadDeck({
          id: refreshed.id,
          name: refreshed.name,
          slides: refreshed.slides,
        }),
      );

      sendToast({
        message: t`Deck generated — ${refreshed.slides.length} slides`,
        icon: "check",
      });
      // Auto-close after a short beat so the user sees the final "Done" log line.
      setTimeout(() => {
        setIsStreaming(false);
        handleClose();
      }, 600);
    } catch (err) {
      const message =
        (err as { message?: string })?.message ?? t`Generation failed`;
      sendToast({ message, icon: "warning" });
      setIsStreaming(false);
    } finally {
      abortRef.current = null;
    }
  };

  const lastEntryId = log[log.length - 1]?.id;

  return (
    <Modal
      opened={isOpen}
      onClose={handleClose}
      title={
        <Group gap="xs" className={S.modalHeader}>
          <Icon name="sparkles" className={S.sparkles} />
          <Text fw={600}>{t`Generate slides`}</Text>
        </Group>
      }
      size="lg"
      centered
      closeOnClickOutside={!isStreaming}
      closeOnEscape={!isStreaming}
      withCloseButton={!isStreaming}
    >
      {!isStreaming && log.length === 0 ? (
        <Stack className={S.body}>
          <Box>
            <Text
              className={S.label}
            >{t`What's this presentation about?`}</Text>
            <Textarea
              autosize
              minRows={3}
              maxRows={6}
              value={prompt}
              onChange={(e) => setPrompt(e.currentTarget.value)}
              placeholder={t`e.g. Q3 product review for the leadership team — focus on user growth and revenue.`}
              autoFocus
            />
          </Box>

          <Box>
            <Text className={S.label}>
              {t`Pick a dashboard or cards to anchor the deck (optional)`}
            </Text>
            {picked.length > 0 && (
              <Box className={S.selectedRow} mb={6}>
                {picked.map((item) => (
                  <span
                    key={`${item.model}:${item.id}`}
                    className={S.selectedTag}
                  >
                    <Icon
                      name={item.model === "card" ? "line" : "dashboard"}
                      size={12}
                    />
                    {item.name}
                    <ActionIcon
                      variant="subtle"
                      size="xs"
                      aria-label={t`Remove`}
                      onClick={() =>
                        setPicked((p) =>
                          p.filter(
                            (x) =>
                              !(x.id === item.id && x.model === item.model),
                          ),
                        )
                      }
                    >
                      <Icon name="close" size={10} />
                    </ActionIcon>
                  </span>
                ))}
              </Box>
            )}
            <TextInput
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              placeholder={t`Search cards and dashboards…`}
              leftSection={<Icon name="search" />}
            />
            {searchResults.length > 0 && (
              <Box className={S.searchResults} mt={6}>
                {searchResults.map((item) => (
                  <button
                    type="button"
                    key={`${item.model}:${item.id}`}
                    className={S.searchResult}
                    onClick={() => {
                      setPicked((p) => [
                        ...p,
                        {
                          id: item.id as number,
                          model: item.model as "card" | "dashboard",
                          name: item.name ?? t`Untitled`,
                        },
                      ]);
                      setQuery("");
                    }}
                  >
                    <Icon
                      name={item.model === "card" ? "line" : "dashboard"}
                      size={14}
                    />
                    <Text>{item.name}</Text>
                  </button>
                ))}
              </Box>
            )}
          </Box>

          <Box className={S.actions}>
            <Button variant="subtle" onClick={handleClose}>
              {t`Cancel`}
            </Button>
            <Button
              variant="filled"
              leftSection={<Icon name="sparkles" />}
              onClick={handleGenerate}
              disabled={!prompt.trim()}
            >
              {t`Generate`}
            </Button>
          </Box>
        </Stack>
      ) : (
        <Stack className={S.body}>
          <Box className={S.stream} ref={streamRef}>
            {log.map((entry) => (
              <Box
                key={entry.id}
                className={`${S.event} ${entry.id === lastEntryId && isStreaming ? S.eventActive : ""}`}
              >
                <span className={S.eventIcon}>
                  {entry.id === lastEntryId && isStreaming ? (
                    <span className={S.spinner} />
                  ) : (
                    <Icon name={iconForEvent(entry.kind)} size={12} />
                  )}
                </span>
                <Box className={S.eventBody}>
                  <Box className={S.eventTitle}>{entry.title}</Box>
                  {entry.detail && (
                    <Box className={S.eventDetail}>
                      <span className={S.eventCode}>{entry.detail}</span>
                    </Box>
                  )}
                  {entry.kind === "outline" &&
                    entry.payload?.type === "outline" && (
                      <Box className={S.outlineBlock} mt={6}>
                        <Box className={S.outlineTitle}>
                          {entry.payload.outline.title}
                        </Box>
                        <Box className={S.outlineList}>
                          {entry.payload.outline.slides.map((s, i) => (
                            <Box key={i} className={S.outlineItem}>
                              <span className={S.outlineLayout}>
                                {layoutLabel(s.layout)}
                              </span>
                              <Box>
                                <strong>{s.title}</strong>{" "}
                                <span className={S.outlineText}>
                                  — {s.intent}
                                </span>
                              </Box>
                            </Box>
                          ))}
                        </Box>
                      </Box>
                    )}
                </Box>
              </Box>
            ))}
          </Box>

          <Box className={S.actions}>
            {isStreaming ? (
              <Button variant="subtle" color="danger" onClick={handleStop}>
                {t`Stop`}
              </Button>
            ) : (
              <Button variant="subtle" onClick={handleClose}>
                {t`Close`}
              </Button>
            )}
          </Box>
        </Stack>
      )}
    </Modal>
  );
};
