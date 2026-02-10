import cx from "classnames";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { t } from "ttag";
import _ from "underscore";

import { ExportSettingsWidget } from "metabase/common/components/ExportSettingsWidget";
import { Toggle } from "metabase/common/components/Toggle";
import type { ExportFormat } from "metabase/common/types/export";
import CS from "metabase/css/core/index.css";
import { Box, Checkbox, Group, Icon, Text, Tooltip } from "metabase/ui";
import type { SubscriptionSupportingCard } from "metabase-types/api";
import type { DraftDashboardSubscription } from "metabase-types/store";

const DEFAULT_ATTACHMENT_TYPE: AttachmentType = "csv";

type AttachmentType = "csv" | "xlsx";

function getCardIdPair(card: SubscriptionSupportingCard): string {
  return card.id + "|" + card.dashboard_card_id;
}

function getAttachmentTypeFor(
  cards: SubscriptionSupportingCard[],
): AttachmentType | null {
  if (cards.some((c) => c.include_xls)) {
    return "xlsx";
  } else if (cards.some((c) => c.include_csv)) {
    return "csv";
  }
  return null;
}

function getInitialFormattingState(
  cards: SubscriptionSupportingCard[],
): boolean {
  if (cards.length > 0) {
    return cards.some((card) => !!card.format_rows);
  }
  return true;
}

function getInitialPivotingState(cards: SubscriptionSupportingCard[]): boolean {
  if (cards.length > 0) {
    return cards.some((card) => !!card.pivot_results);
  }
  return false;
}

function getInitialAttachmentOnlyState(
  pulse: DraftDashboardSubscription,
): boolean {
  if (pulse?.channels?.length > 0) {
    return pulse.channels.some((channel) => !!channel.details?.attachment_only);
  }
  return false;
}

function calculateStateFromCards(
  cards: SubscriptionSupportingCard[],
  pulse: DraftDashboardSubscription,
) {
  const selectedCards = cards.filter(
    (card) => card.include_csv || card.include_xls,
  );
  return {
    isEnabled: selectedCards.length > 0,
    selectedAttachmentType:
      getAttachmentTypeFor(selectedCards) || DEFAULT_ATTACHMENT_TYPE,
    selectedCardIds: new Set(selectedCards.map(getCardIdPair)),
    isFormattingEnabled: getInitialFormattingState(selectedCards),
    isPivotingEnabled: getInitialPivotingState(selectedCards),
    isAttachmentOnly: getInitialAttachmentOnlyState(pulse),
  };
}

type ExportOptionsState = {
  isFormattingEnabled: boolean;
  isPivotingEnabled: boolean;
  isAttachmentOnly: boolean;
};

type ExportOptionsAction =
  | { type: "TOGGLE_FORMATTING" }
  | { type: "TOGGLE_PIVOTING" }
  | { type: "TOGGLE_ATTACHMENT_ONLY" }
  | { type: "DISABLE_ATTACHMENT_ONLY" }
  | { type: "SET_ALL"; payload: ExportOptionsState };

function exportOptionsReducer(
  state: ExportOptionsState,
  action: ExportOptionsAction,
): ExportOptionsState {
  switch (action.type) {
    case "TOGGLE_FORMATTING":
      return { ...state, isFormattingEnabled: !state.isFormattingEnabled };
    case "TOGGLE_PIVOTING":
      return { ...state, isPivotingEnabled: !state.isPivotingEnabled };
    case "TOGGLE_ATTACHMENT_ONLY":
      return { ...state, isAttachmentOnly: !state.isAttachmentOnly };
    case "DISABLE_ATTACHMENT_ONLY":
      return { ...state, isAttachmentOnly: false };
    case "SET_ALL":
      return action.payload;
    default:
      return state;
  }
}

const INITIAL_EXPORT_OPTIONS: ExportOptionsState = {
  isFormattingEnabled: true,
  isPivotingEnabled: false,
  isAttachmentOnly: false,
};

type EmailAttachmentPickerProps = {
  pulse: DraftDashboardSubscription;
  setPulse: (pulse: DraftDashboardSubscription) => void;
  cards: SubscriptionSupportingCard[];
  allowDownload: boolean | undefined;
};

export function EmailAttachmentPicker({
  pulse,
  setPulse,
  cards,
  allowDownload,
}: EmailAttachmentPickerProps) {
  const [isEnabled, setIsEnabled] = useState(false);
  const [selectedAttachmentType, setSelectedAttachmentType] =
    useState<AttachmentType>(DEFAULT_ATTACHMENT_TYPE);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(
    new Set(),
  );
  const [exportOptions, dispatchExportOptions] = useReducer(
    exportOptionsReducer,
    INITIAL_EXPORT_OPTIONS,
  );

  const { isFormattingEnabled, isPivotingEnabled, isAttachmentOnly } =
    exportOptions;

  const updatePulseCards = useCallback(
    /*
     * Reaches into the parent component (via setPulse) to update its pulsecard's include_{csv,xls} values
     * based on this component's state.
     */
    (
      attachmentType: AttachmentType,
      cardIds: Set<string>,
      options: ExportOptionsState,
    ) => {
      const isXls = attachmentType === "xlsx";
      const isCsv = attachmentType === "csv";

      setSelectedAttachmentType(attachmentType);

      setPulse({
        ...pulse,
        cards: pulse.cards.map((card) => ({
          ...card,
          include_csv: cardIds.has(getCardIdPair(card)) && isCsv,
          include_xls: cardIds.has(getCardIdPair(card)) && isXls,
          format_rows: isCsv && options.isFormattingEnabled,
          pivot_results: card.display === "pivot" && options.isPivotingEnabled,
        })),
        channels: pulse.channels.map((channel) => ({
          ...channel,
          details: {
            ...channel.details,
            attachment_only: options.isAttachmentOnly,
          },
        })),
      });
    },
    [pulse, setPulse],
  );

  // Sync state from cards on mount and when cards/pulse change
  const isInitialMount = useRef(true);
  const prevComputedStateRef = useRef<ReturnType<
    typeof calculateStateFromCards
  > | null>(null);

  useEffect(() => {
    const newState = calculateStateFromCards(cards, pulse);
    const prev = prevComputedStateRef.current;

    const applyState = (isInitial: boolean) => {
      prevComputedStateRef.current = newState;

      if (isInitial) {
        setIsEnabled(newState.isEnabled);
        setSelectedAttachmentType(newState.selectedAttachmentType);
        setSelectedCardIds(newState.selectedCardIds);
      } else {
        // Preserve enabled state if it was already enabled
        setIsEnabled((prevEnabled) => newState.isEnabled || prevEnabled);
        // Only update attachment type if there are selected cards
        setSelectedAttachmentType((prevType) =>
          newState.selectedCardIds.size === 0
            ? prevType
            : newState.selectedAttachmentType,
        );
        setSelectedCardIds((prevIds) =>
          _.isEqual(newState.selectedCardIds, prevIds)
            ? prevIds
            : newState.selectedCardIds,
        );
      }

      dispatchExportOptions({
        type: "SET_ALL",
        payload: {
          isFormattingEnabled: newState.isFormattingEnabled,
          isPivotingEnabled: newState.isPivotingEnabled,
          isAttachmentOnly: newState.isAttachmentOnly,
        },
      });
    };

    if (isInitialMount.current) {
      isInitialMount.current = false;
      applyState(true);
      return;
    }

    // Skip if nothing meaningful changed
    const hasNoMeaningfulChanges =
      prev &&
      (prev.isEnabled || !newState.isEnabled) &&
      prev.selectedAttachmentType === newState.selectedAttachmentType &&
      _.isEqual(prev.selectedCardIds, newState.selectedCardIds) &&
      prev.isFormattingEnabled === newState.isFormattingEnabled &&
      prev.isPivotingEnabled === newState.isPivotingEnabled &&
      prev.isAttachmentOnly === newState.isAttachmentOnly;

    if (hasNoMeaningfulChanges) {
      return;
    }

    applyState(false);
  }, [cards, pulse]);

  const canAttachFiles = !!allowDownload;
  const canConfigurePivoting = cards.some((card) => card.display === "pivot");
  const areAllSelected = cards.length === selectedCardIds.size;
  const areOnlySomeSelected =
    selectedCardIds.size > 0 && selectedCardIds.size < cards.length;

  const disabledReason = !canAttachFiles
    ? t`You don't have permission to download results and therefore cannot attach files to subscriptions.`
    : null;

  const allCardIds = useMemo(() => new Set(cards.map(getCardIdPair)), [cards]);

  const cardIdsToCards = useCallback(
    (cardIds: Set<string>) =>
      pulse.cards.filter((card) => cardIds.has(getCardIdPair(card))),
    [pulse.cards],
  );

  const toggleAttach = useCallback(
    /*
     * Called when attachments are enabled/disabled at all
     */
    (includeAttachment: boolean) => {
      if (!includeAttachment) {
        const emptySet = new Set<string>();
        setSelectedCardIds(emptySet);
        updatePulseCards(selectedAttachmentType, emptySet, {
          ...exportOptions,
          isAttachmentOnly: false,
        });
      }

      setIsEnabled(includeAttachment);
      if (!includeAttachment) {
        dispatchExportOptions({ type: "DISABLE_ATTACHMENT_ONLY" });
      }
    },
    [selectedAttachmentType, updatePulseCards, exportOptions],
  );

  const setAttachmentType = useCallback(
    /*
     * Called when the attachment type toggle (csv/xls) is clicked
     */
    (format: ExportFormat) => {
      if (format === "csv" || format === "xlsx") {
        updatePulseCards(format, selectedCardIds, exportOptions);
      }
    },
    [selectedCardIds, updatePulseCards, exportOptions],
  );

  const onToggleCard = useCallback(
    (card: SubscriptionSupportingCard) => {
      const id = getCardIdPair(card);
      const attachmentType =
        getAttachmentTypeFor(cardIdsToCards(selectedCardIds)) ||
        selectedAttachmentType;

      const next = new Set(selectedCardIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      setSelectedCardIds(next);
      updatePulseCards(attachmentType, next, exportOptions);
    },
    [
      cardIdsToCards,
      selectedCardIds,
      selectedAttachmentType,
      updatePulseCards,
      exportOptions,
    ],
  );

  const onToggleAll = useCallback(() => {
    /*
     * Called when (de)select-all checkbox is clicked
     */
    const attachmentType =
      getAttachmentTypeFor(cardIdsToCards(selectedCardIds)) ||
      selectedAttachmentType;
    const newSelectedCardIds =
      cards.length === selectedCardIds.size ? new Set<string>() : allCardIds;

    setSelectedCardIds(newSelectedCardIds);
    updatePulseCards(attachmentType, newSelectedCardIds, exportOptions);
  }, [
    allCardIds,
    cardIdsToCards,
    cards.length,
    selectedCardIds,
    selectedAttachmentType,
    updatePulseCards,
    exportOptions,
  ]);

  const onToggleFormatting = useCallback(() => {
    const newOptions = {
      ...exportOptions,
      isFormattingEnabled: !isFormattingEnabled,
    };
    dispatchExportOptions({ type: "TOGGLE_FORMATTING" });
    updatePulseCards(selectedAttachmentType, selectedCardIds, newOptions);
  }, [
    selectedAttachmentType,
    selectedCardIds,
    updatePulseCards,
    exportOptions,
    isFormattingEnabled,
  ]);

  const onTogglePivoting = useCallback(() => {
    const newOptions = {
      ...exportOptions,
      isPivotingEnabled: !isPivotingEnabled,
    };
    dispatchExportOptions({ type: "TOGGLE_PIVOTING" });
    updatePulseCards(selectedAttachmentType, selectedCardIds, newOptions);
  }, [
    selectedAttachmentType,
    selectedCardIds,
    updatePulseCards,
    exportOptions,
    isPivotingEnabled,
  ]);

  const onToggleAttachmentOnly = useCallback(() => {
    const newOptions = {
      ...exportOptions,
      isAttachmentOnly: !isAttachmentOnly,
    };
    dispatchExportOptions({ type: "TOGGLE_ATTACHMENT_ONLY" });
    updatePulseCards(selectedAttachmentType, selectedCardIds, newOptions);
  }, [
    selectedAttachmentType,
    selectedCardIds,
    updatePulseCards,
    exportOptions,
    isAttachmentOnly,
  ]);

  return (
    <div>
      <Group
        className={CS.borderTop}
        justify="space-between"
        pt="1.5rem"
        pb="1.5rem"
        opacity={canAttachFiles ? 1 : 0.6}
      >
        <Group gap="0">
          <Text fw="bold">{t`Attach results as files`}</Text>
          <Icon
            name="info"
            c="text-secondary"
            ml="0.5rem"
            size={12}
            tooltip={
              disabledReason ||
              t`Attachments can contain up to 2,000 rows of data.`
            }
          />
        </Group>
        <Tooltip label={disabledReason} disabled={!disabledReason}>
          <Toggle
            aria-label={t`Attach results`}
            value={isEnabled && canAttachFiles}
            onChange={toggleAttach}
            disabled={!canAttachFiles}
          />
        </Tooltip>
      </Group>
      {isEnabled && canAttachFiles && (
        <div>
          <Box py="1rem">
            <ExportSettingsWidget
              selectedFormat={selectedAttachmentType}
              formats={["csv", "xlsx"]}
              isFormattingEnabled={isFormattingEnabled}
              isPivotingEnabled={isPivotingEnabled}
              canConfigureFormatting={selectedAttachmentType === "csv"}
              canConfigurePivoting={canConfigurePivoting}
              onChangeFormat={setAttachmentType}
              onToggleFormatting={onToggleFormatting}
              onTogglePivoting={onTogglePivoting}
            />
          </Box>
          <div
            className={cx(
              CS.pt1,
              CS.pb2,
              CS.flex,
              CS.justifyBetween,
              CS.alignCenter,
            )}
          >
            <ul className={CS.full}>
              <li
                className={cx(
                  CS.mb2,
                  CS.pb1,
                  CS.flex,
                  CS.alignCenter,
                  CS.cursorPointer,
                  CS.borderBottom,
                )}
              >
                <Checkbox
                  variant="stacked"
                  label={t`Questions to attach`}
                  checked={areAllSelected}
                  indeterminate={areOnlySomeSelected}
                  onChange={onToggleAll}
                />
              </li>
              {cards.map((card) => (
                <li key={getCardIdPair(card)}>
                  <Checkbox
                    mb="1rem"
                    mr="0.5rem"
                    checked={selectedCardIds.has(getCardIdPair(card))}
                    label={card.name}
                    onChange={() => {
                      onToggleCard(card);
                    }}
                  />
                </li>
              ))}
            </ul>
          </div>
          <Group justify="space-between" pt="1rem">
            <Group gap="0">
              <Text fw="bold">{t`Send only attachments (no charts)`}</Text>
              <Icon
                name="info"
                c="text-secondary"
                ml="0.5rem"
                size={12}
                tooltip={t`When enabled, only file attachments will be sent (no email content).`}
              />
            </Group>
            <Toggle
              aria-label={t`Send only attachments`}
              value={isAttachmentOnly}
              onChange={onToggleAttachmentOnly}
            />
          </Group>
        </div>
      )}
    </div>
  );
}
