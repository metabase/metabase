import { useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { CreateDashboardModal } from "metabase/common/CreateDashboard/CreateDashboardModal";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import { useNavigate } from "metabase/router";
import {
  ActionIcon,
  Button,
  Flex,
  Icon,
  Text,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import { getIconForVisualizationType } from "metabase/viz-core";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";

import { useExploreUpdate } from "../ExploreBar/use-explore-update";
import { getAdHocQuestionDescription } from "../ViewHeader/components/AdHocQuestionDescription/AdHocQuestionDescription";

import S from "./ExplorePins.module.css";
import {
  type ExplorePin,
  addPin,
  clearPins,
  getPinFromQuestion,
  removePin,
  useExplorePins,
} from "./pin-store";
import { useCreatePinDashboard } from "./use-create-pin-dashboard";

type PinButtonProps = {
  question: Question;
};

/** Pins what's on screen, so it can go on a dashboard later without leaving the page. */
export function PinButton({ question }: PinButtonProps) {
  const pins = useExplorePins();
  const name = getPinName(question);

  return (
    <Tooltip label={t`Pin this view to build a dashboard from`}>
      <Button
        size="sm"
        variant="subtle"
        leftSection={<Icon name="pin" />}
        onClick={() => addPin(getPinFromQuestion(question, name))}
      >
        {pins.length > 0 ? t`Pin (${pins.length})` : t`Pin`}
      </Button>
    </Tooltip>
  );
}

/** The saved question's name, or the title the header shows for an unsaved one. */
function getPinName(question: Question): string {
  const savedName = question.isSaved() ? question.displayName() : null;
  return (
    savedName ??
    (getAdHocQuestionDescription({ question }) ||
      Lib.suggestedName(question.query()))
  );
}

type PinTrayProps = {
  question: Question;
};

/** The pinned views: open one again, drop one, or turn them all into a dashboard. */
export function PinTray({ question }: PinTrayProps) {
  const pins = useExplorePins();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const updateExploreQuestion = useExploreUpdate();
  const { create, isSaving } = useCreatePinDashboard();
  const [isCreatingDashboard, setIsCreatingDashboard] = useState(false);

  if (pins.length === 0) {
    return null;
  }

  const handleOpenPin = (pin: ExplorePin) => {
    const pinnedQuestion = Question.create({
      metadata: question.metadata(),
      dataset_query: pin.dataset_query,
      visualization_settings: pin.visualization_settings,
    })
      .setDisplay(pin.display)
      .lockDisplay();
    updateExploreQuestion(question, pinnedQuestion);
  };

  const handleCreateDashboard = async (
    dashboard: Parameters<typeof create>[0],
  ) => {
    setIsCreatingDashboard(false);
    const { savedCount, failedCount } = await create(dashboard, pins);
    clearPins();
    dispatch(
      addUndo({
        icon: failedCount > 0 ? "warning" : "check",
        message:
          failedCount > 0
            ? t`${dashboard.name} is ready, but ${failedCount} pinned views couldn't be saved`
            : ngettext(
                msgid`${dashboard.name} is ready with ${savedCount} question`,
                `${dashboard.name} is ready with ${savedCount} questions`,
                savedCount,
              ),
        canDismiss: true,
        extraAction: {
          label: t`Open`,
          action: () => navigate(Urls.dashboard(dashboard)),
        },
      }),
    );
  };

  return (
    <Flex
      className={S.tray}
      align="center"
      gap="sm"
      data-testid="explore-pin-tray"
    >
      <Icon name="pin" c="text-secondary" />
      <Text className={S.trayLabel}>{t`Pinned`}</Text>
      <Flex className={S.pins} gap="xs">
        {pins.map((pin) => (
          <PinChip
            key={pin.id}
            pin={pin}
            onOpen={() => handleOpenPin(pin)}
            onRemove={() => removePin(pin.id)}
          />
        ))}
      </Flex>
      <Button
        size="sm"
        variant="filled"
        ml="auto"
        loading={isSaving}
        leftSection={<Icon name="dashboard" />}
        onClick={() => setIsCreatingDashboard(true)}
      >
        {t`Make a dashboard`}
      </Button>
      <Tooltip label={t`Unpin all`}>
        <ActionIcon aria-label={t`Unpin all`} onClick={clearPins}>
          <Icon name="close" />
        </ActionIcon>
      </Tooltip>
      <CreateDashboardModal
        opened={isCreatingDashboard}
        collectionId={question.collectionId()}
        onClose={() => setIsCreatingDashboard(false)}
        onCreate={(dashboard) => void handleCreateDashboard(dashboard)}
      />
    </Flex>
  );
}

type PinChipProps = {
  pin: ExplorePin;
  onOpen: () => void;
  onRemove: () => void;
};

function PinChip({ pin, onOpen, onRemove }: PinChipProps) {
  const { name: iconName } = getIconForVisualizationType(pin.display);
  return (
    <Flex className={S.pin} align="center">
      <UnstyledButton
        className={S.pinButton}
        onClick={onOpen}
        aria-label={t`Open ${pin.name}`}
      >
        <Icon name={iconName} size={14} />
        <span className={S.pinName}>{pin.name}</span>
      </UnstyledButton>
      <UnstyledButton
        className={S.pinRemove}
        aria-label={t`Unpin ${pin.name}`}
        onClick={onRemove}
      >
        <Icon name="close" size={10} />
      </UnstyledButton>
    </Flex>
  );
}
