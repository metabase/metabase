import { useMemo, useState } from "react";
import { t } from "ttag";

import {
  useGenerateSlidesMutation,
  useSearchQuery,
  useUpdateSlidesMutation,
} from "metabase/api";
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

import {
  closeGenerateModal,
  markClean,
  replaceSlides,
} from "../../slides.slice";
import {
  getDeckId,
  getIsGenerateModalOpen,
} from "../../selectors";

import S from "./GenerateModal.module.css";

interface PickedItem {
  id: number;
  model: "card" | "dashboard";
  name: string;
}

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

  const [generate, { isLoading: isGenerating }] = useGenerateSlidesMutation();
  const [updateSlides] = useUpdateSlidesMutation();

  const handleClose = () => {
    if (isGenerating) {
      return;
    }
    dispatch(closeGenerateModal());
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || !deckId) {
      return;
    }
    try {
      const result = await generate({
        prompt: prompt.trim(),
        card_ids: picked.filter((p) => p.model === "card").map((p) => p.id),
        dashboard_ids: picked
          .filter((p) => p.model === "dashboard")
          .map((p) => p.id),
      }).unwrap();

      dispatch(replaceSlides({ name: result.name, slides: result.slides }));
      // Persist immediately so a refresh doesn't lose the generated deck
      await updateSlides({
        id: deckId,
        name: result.name,
        slides: result.slides,
      }).unwrap();
      dispatch(markClean());
      dispatch(closeGenerateModal());
      setPrompt("");
      setQuery("");
      setPicked([]);
      sendToast({
        message: t`Generated ${result.slides.length} slides`,
        icon: "check",
      });
    } catch (err) {
      const message =
        (err as { data?: { message?: string } })?.data?.message ??
        t`Couldn't generate slides`;
      sendToast({ message, icon: "warning" });
    }
  };

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
    >
      <Stack className={S.body}>
        <Box>
          <Text className={S.label}>{t`What's this presentation about?`}</Text>
          <Textarea
            autosize
            minRows={3}
            maxRows={6}
            value={prompt}
            onChange={(e) => setPrompt(e.currentTarget.value)}
            placeholder={t`e.g. Q3 product review for the leadership team — focus on user growth and revenue.`}
          />
        </Box>

        <Box>
          <Text className={S.label}>
            {t`Include these from Metabase (optional)`}
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
                          (x) => !(x.id === item.id && x.model === item.model),
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
          <Button variant="subtle" onClick={handleClose} disabled={isGenerating}>
            {t`Cancel`}
          </Button>
          <Button
            variant="filled"
            leftSection={<Icon name="sparkles" />}
            onClick={handleGenerate}
            loading={isGenerating}
            disabled={!prompt.trim()}
          >
            {t`Generate`}
          </Button>
        </Box>
      </Stack>
    </Modal>
  );
};
