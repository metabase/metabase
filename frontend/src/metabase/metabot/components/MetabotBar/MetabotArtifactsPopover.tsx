import { useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { skipToken, useListCollectionItemsQuery } from "metabase/api";
import PinnedQuestionLoader from "metabase/collections/components/PinnedQuestionCard/PinnedQuestionLoader";
import { useDispatch, useSelector } from "metabase/redux";
import { getUserPersonalCollectionId } from "metabase/selectors/user";
import {
  ActionIcon,
  Box,
  Center,
  Flex,
  Group,
  Icon,
  Loader,
  Popover,
  Text,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import type { CardId } from "metabase-types/api";

import S from "./MetabotArtifactsPopover.module.css";
import { setArtifactDragData } from "./artifactDragData";

const GRID_PREVIEW_HEIGHT = "11rem";
const LIST_PREVIEW_HEIGHT = "13.25rem";

type ArtifactView = "grid" | "list";

function ArtifactTile({
  id,
  height,
  onClick,
}: {
  id: CardId;
  height: string;
  onClick: (id: CardId) => void;
}) {
  return (
    <UnstyledButton
      className={S.tile}
      w="100%"
      draggable
      data-testid="metabot-artifact-tile"
      onDragStart={(e) => {
        setArtifactDragData(e.dataTransfer, { model: "card", id });
        // use a lightweight chip as the drag image — the tile's full
        // visualization makes a heavy, bleeding default ghost
        const ghost = e.currentTarget.querySelector("[data-drag-image]");
        if (ghost instanceof HTMLElement) {
          e.dataTransfer.setDragImage(ghost, 0, 0);
        }
      }}
      onClick={() => onClick(id)}
    >
      <PinnedQuestionLoader id={id}>
        {({ question, rawSeries, loading, error, errorIcon }) => (
          <Flex direction="column" h={height}>
            <Text
              fw="bold"
              size="sm"
              truncate
              px="md"
              pt="sm"
              pb="xs"
              data-drag-image
            >
              {question?.displayName() ?? t`Untitled`}
            </Text>
            <Box flex="1 0 0" mih={0}>
              {loading ? (
                <Center h="100%">
                  <Loader size="sm" />
                </Center>
              ) : (
                <Visualization
                  rawSeries={rawSeries}
                  error={error}
                  errorIcon={errorIcon}
                  isDashboard
                />
              )}
            </Box>
          </Flex>
        )}
      </PinnedQuestionLoader>
    </UnstyledButton>
  );
}

export function MetabotArtifactsPopover() {
  const dispatch = useDispatch();
  const [opened, setOpened] = useState(false);
  const [view, setView] = useState<ArtifactView>("grid");
  const personalCollectionId = useSelector(getUserPersonalCollectionId);

  const { data, isLoading, isError } = useListCollectionItemsQuery(
    personalCollectionId != null
      ? {
          id: personalCollectionId,
          models: ["card"],
          ai_generated: true,
          sort_column: "created_at",
          sort_direction: "desc",
        }
      : skipToken,
    { skip: !opened },
  );
  const cardIds = (data?.data ?? []).map((item) => item.id);

  const handleTileClick = (id: CardId) => {
    dispatch(push(`/question/${id}`));
    setOpened(false);
  };

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-end"
      shadow="md"
      width={585}
      withinPortal
    >
      <Popover.Target>
        <Tooltip label={t`Artifacts`} position="bottom">
          <ActionIcon
            variant="subtle"
            size="sm"
            c="text-secondary"
            aria-label={t`Artifacts`}
            onClick={() => setOpened((v) => !v)}
            data-testid="metabot-artifacts-trigger"
          >
            <Icon name="shapes" size={16} c="text-secondary" />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown p={0}>
        <Group
          justify="space-between"
          px="md"
          py="sm"
          style={{ borderBottom: "1px solid var(--mb-color-border)" }}
        >
          <Text fw="bold" size="sm" data-testid="metabot-artifacts-title">
            {t`Artifacts`}
          </Text>
          <Group gap={2}>
            <ActionIcon
              variant={view === "grid" ? "filled" : "subtle"}
              size="sm"
              aria-label={t`Grid view`}
              onClick={() => setView("grid")}
            >
              <Icon name="grid" size={14} />
            </ActionIcon>
            <ActionIcon
              variant={view === "list" ? "filled" : "subtle"}
              size="sm"
              aria-label={t`List view`}
              onClick={() => setView("list")}
            >
              <Icon name="list" size={14} />
            </ActionIcon>
          </Group>
        </Group>
        <Box mih={420} mah={520} p="md" style={{ overflowY: "auto" }}>
          {isLoading && (
            <Center h={388} data-testid="metabot-artifacts-loading">
              <Loader size="sm" />
            </Center>
          )}
          {!isLoading && isError && (
            <Center h={388}>
              <Text c="text-secondary" size="sm">
                {t`We couldn't load your artifacts.`}
              </Text>
            </Center>
          )}
          {!isLoading && !isError && cardIds.length === 0 && (
            <Center h={388}>
              <Text c="text-secondary" size="sm">
                {t`No artifacts yet.`}
              </Text>
            </Center>
          )}
          {!isLoading && !isError && cardIds.length > 0 && (
            <Box
              data-testid="metabot-artifacts-list"
              display="grid"
              style={{
                gap: "var(--mantine-spacing-sm)",
                gridTemplateColumns: view === "grid" ? "1fr 1fr" : "1fr",
              }}
            >
              {cardIds.map((id) => (
                <ArtifactTile
                  key={id}
                  id={id}
                  height={
                    view === "grid" ? GRID_PREVIEW_HEIGHT : LIST_PREVIEW_HEIGHT
                  }
                  onClick={handleTileClick}
                />
              ))}
            </Box>
          )}
        </Box>
      </Popover.Dropdown>
    </Popover>
  );
}
