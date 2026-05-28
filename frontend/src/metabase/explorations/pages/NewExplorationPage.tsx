import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { snapCenterToCursor } from "@dnd-kit/modifiers";
import { useClickOutside } from "@mantine/hooks";
import type { Location } from "history";
import { useCallback, useEffect, useRef, useState } from "react";

import { explorationApi } from "metabase/api/exploration";
import { EditableText } from "metabase/common/components/EditableText";
import CS from "metabase/css/core/index.css";
import { QuestionModeSwitcher } from "metabase/metabot/components/QuestionModeSwitcher";
import {
  useMetabotAgent,
  useUserMetabotPermissions,
} from "metabase/metabot/hooks";
import { Box, Center, Group, Paper, Stack } from "metabase/ui";

import { ExplorationDragGhost } from "../components/ExplorationDragGhost";
import {
  EXPLORATIONS_AGENT_ID,
  NewExplorationChat,
} from "../components/NewExplorationChat/NewExplorationChat";
import { NewExplorationData } from "../components/NewExplorationData";
import { NewExplorationBrowse } from "../components/NewExplorationLeftTabs/NewExplorationBrowse";
import {
  EXPLORATION_NAME_MAX_LENGTH,
  getDefaultExplorationName,
} from "../constants";
import {
  type ExplorationDragData,
  useExplorationDnd,
  useExplorationNavigation,
  useExplorationSelection,
} from "../hooks";

export function NewExplorationPage(props: { location?: Location }) {
  return <NewExplorationPageInner key={props.location?.key} />;
}

function NewExplorationPageInner() {
  const selection = useExplorationSelection();
  const navigation = useExplorationNavigation();
  const { handleDragEnd: handleDragEndSelection } =
    useExplorationDnd(selection);
  const { metrics, dimensions, timelines, name, setName } = selection;

  // A small activation distance so a tap on the Browse picker rows
  // still fires a click (toggle) — we only start a drag when the
  // pointer moves at least 5px. Without this, dnd-kit would
  // pre-empt the click and the checkbox would never toggle.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // Track the active drag payload so the page-level <DragOverlay>
  // can render a floating ghost of what the cursor is carrying. We
  // clear it on end/cancel so a stale ghost can't outlive the drag.
  const [activeDrag, setActiveDrag] = useState<ExplorationDragData | null>(
    null,
  );
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as ExplorationDragData | undefined;
    setActiveDrag(data ?? null);
  }, []);
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      handleDragEndSelection(event);
      setActiveDrag(null);
    },
    [handleDragEndSelection],
  );
  const handleDragCancel = useCallback(() => {
    setActiveDrag(null);
  }, []);

  // Outside-click deselects the active block. The Research plan column
  // and the Data palette column are both "inside" — clicks anywhere
  // else (chat, page chrome, etc.) clear the selection. We hold
  // imperative refs on both column wrappers and feed them to
  // `useClickOutside`'s `nodes` parameter; switching between two
  // blocks doesn't fire this because the click hits inside the
  // Research plan column.
  const planRef = useRef<HTMLDivElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);
  useClickOutside(
    () => {
      if (navigation.activeBlockId != null) {
        navigation.clearActiveBlock();
      }
    },
    null,
    [planRef.current, paletteRef.current].filter(
      (n): n is HTMLDivElement => n != null,
    ),
  );

  const { hasNlqAccess } = useUserMetabotPermissions();

  // Wipe the agent's conversation for this profile every time the page mounts
  const { resetConversation, messages } = useMetabotAgent(
    EXPLORATIONS_AGENT_ID,
  );
  useEffect(() => {
    resetConversation();
  }, [resetConversation]);

  // Warm the RTK Query cache for the Browse tab's metrics/dimensions lists
  const prefetchExplorationData =
    explorationApi.usePrefetch("getExplorationData");

  useEffect(() => {
    prefetchExplorationData({});
  }, [prefetchExplorationData]);

  const shouldShowModeSwitcher =
    // this page is usable without NLQ access, but the explore tab is not
    hasNlqAccess &&
    // hide the mode switcher once the user has started chatting or selecting data
    metrics.length === 0 &&
    dimensions.length === 0 &&
    timelines.length === 0 &&
    messages.length === 0;

  return (
    <Stack h="100%" gap={0} bg="background-primary" miw="67.375rem">
      {shouldShowModeSwitcher ? (
        <Box pt="lg" pb="3rem" ta="center">
          <QuestionModeSwitcher value="research" />
        </Box>
      ) : (
        <Box pt="2rem" pb="2.5rem" px="3rem">
          <EditableText
            initialValue={name}
            onChange={setName}
            placeholder={getDefaultExplorationName()}
            bd="none"
            fw="bold"
            fz="h2"
            lh="1.875rem"
            maxLength={EXPLORATION_NAME_MAX_LENGTH}
          />
        </Box>
      )}
      <Center px="3rem" pb="3rem" flex={1} mih={0}>
        <Paper
          className={CS.overflowHidden}
          h="100%"
          w="100%"
          maw="93.75rem"
          mah="62.5rem"
          bd="1px solid border"
        >
          {/*
           * Three-column page layout: Chat (agent flow) | Research content
           * (selection summary with "+" deep-links) | Data palette (the
           * tabbed Browse picker — Metrics / Dimensions / Timelines).
           *
           * Chat and Browse are wrapped in their own flex columns so each
           * shrinks/grows independently; `NewExplorationData` carries its
           * own width constraints (`flex={0.68}` + `maw`/`miw`) so the
           * middle column stays the narrowest of the three.
           */}
          <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <Group
              h="100%"
              w="100%"
              align="stretch"
              wrap="nowrap"
              bdrs="md"
              gap={0}
            >
              <Stack flex={1} miw={0} mih={0} h="100%" gap={0}>
                <NewExplorationChat selection={selection} />
              </Stack>
              <Box
                ref={planRef}
                style={{ display: "flex", flex: 1, minWidth: 0, minHeight: 0 }}
              >
                <NewExplorationData
                  selection={selection}
                  navigation={navigation}
                />
              </Box>
              <Stack
                ref={paletteRef}
                flex={0.75}
                miw={0}
                mih={0}
                h="100%"
                gap={0}
              >
                <NewExplorationBrowse
                  selection={selection}
                  navigation={navigation}
                />
              </Stack>
            </Group>
            {/*
             * `snapCenterToCursor` makes the overlay pin to the cursor
             * instead of tracking from the source's measured rect. The
             * Browse pickers are virtualized — every row is
             * `position: absolute; transform: translateY(N px)` inside
             * its scroll container — and dnd-kit's default rect
             * measurement places the overlay at coordinates that can
             * fall outside the viewport (especially for rows scrolled
             * deep into the list), so without this modifier the ghost
             * appears to vanish.
             */}
            <DragOverlay dropAnimation={null} modifiers={[snapCenterToCursor]}>
              {activeDrag ? <ExplorationDragGhost data={activeDrag} /> : null}
            </DragOverlay>
          </DndContext>
        </Paper>
      </Center>
    </Stack>
  );
}
