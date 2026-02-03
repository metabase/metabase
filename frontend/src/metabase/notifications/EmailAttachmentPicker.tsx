import cx from "classnames";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { ExportSettingsWidget } from "metabase/common/components/ExportSettingsWidget";
import { Toggle } from "metabase/common/components/Toggle";
import type { ExportFormat } from "metabase/common/types/export";
import CS from "metabase/css/core/index.css";
import { Box, Checkbox, Group, Icon, Text, Tooltip } from "metabase/ui";
import type {
  DashboardSubscription,
  SubscriptionSupportingCard,
} from "metabase-types/api";

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

function getInitialAttachmentOnlyState(pulse: DashboardSubscription): boolean {
  if (pulse?.channels?.length > 0) {
    return pulse.channels.some((channel) => !!channel.details?.attachment_only);
  }
  return false;
}

function calculateStateFromCards(
  cards: SubscriptionSupportingCard[],
  pulse: DashboardSubscription,
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

type EmailAttachmentPickerProps = {
  pulse: DashboardSubscription;
  setPulse: (pulse: DashboardSubscription) => void;
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
  const [isFormattingEnabled, setIsFormattingEnabled] = useState(true);
  const [isPivotingEnabled, setIsPivotingEnabled] = useState(false);
  const [isAttachmentOnly, setIsAttachmentOnly] = useState(false);
  const [selectedAttachmentType, setSelectedAttachmentType] =
    useState<AttachmentType>(DEFAULT_ATTACHMENT_TYPE);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(
    new Set(),
  );

  const updatePulseCards = useCallback(
    /*
     * Reaches into the parent component (via setPulse) to update its pulsecard's include_{csv,xls} values
     * based on this component's state.
     */
    (
      attachmentType: AttachmentType,
      cardIds: Set<string>,
      options: {
        isFormattingEnabled: boolean;
        isPivotingEnabled: boolean;
        isAttachmentOnly: boolean;
      },
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

    if (isInitialMount.current) {
      isInitialMount.current = false;
      prevComputedStateRef.current = newState;
      setIsEnabled(newState.isEnabled);
      setSelectedAttachmentType(newState.selectedAttachmentType);
      setSelectedCardIds(newState.selectedCardIds);
      setIsFormattingEnabled(newState.isFormattingEnabled);
      setIsPivotingEnabled(newState.isPivotingEnabled);
      setIsAttachmentOnly(newState.isAttachmentOnly);
      return;
    }

    const prev = prevComputedStateRef.current;
    // Match class component's shouldUpdateState: skip if nothing meaningful changed
    if (
      prev &&
      (prev.isEnabled || !newState.isEnabled) &&
      prev.selectedAttachmentType === newState.selectedAttachmentType &&
      _.isEqual(prev.selectedCardIds, newState.selectedCardIds) &&
      prev.isFormattingEnabled === newState.isFormattingEnabled &&
      prev.isPivotingEnabled === newState.isPivotingEnabled &&
      prev.isAttachmentOnly === newState.isAttachmentOnly
    ) {
      return;
    }
    prevComputedStateRef.current = newState;

    setIsEnabled((prev) => newState.isEnabled || prev);
    setSelectedAttachmentType((prev) =>
      newState.selectedCardIds.size === 0
        ? prev
        : newState.selectedAttachmentType,
    );
    setSelectedCardIds((prev) => {
      if (_.isEqual(newState.selectedCardIds, prev)) {
        return prev;
      }
      return newState.selectedCardIds;
    });
    setIsFormattingEnabled(newState.isFormattingEnabled);
    setIsPivotingEnabled(newState.isPivotingEnabled);
    setIsAttachmentOnly(newState.isAttachmentOnly);
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
          isFormattingEnabled,
          isPivotingEnabled,
          isAttachmentOnly: false,
        });
      }

      setIsEnabled(includeAttachment);
      setIsAttachmentOnly((prev) => (includeAttachment ? prev : false));
    },
    [
      selectedAttachmentType,
      updatePulseCards,
      isFormattingEnabled,
      isPivotingEnabled,
    ],
  );

  const setAttachmentType = useCallback(
    /*
     * Called when the attachment type toggle (csv/xls) is clicked
     */
    (format: ExportFormat) => {
      if (format === "csv" || format === "xlsx") {
        updatePulseCards(format, selectedCardIds, {
          isFormattingEnabled,
          isPivotingEnabled,
          isAttachmentOnly,
        });
      }
    },
    [
      selectedCardIds,
      updatePulseCards,
      isFormattingEnabled,
      isPivotingEnabled,
      isAttachmentOnly,
    ],
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
      updatePulseCards(attachmentType, next, {
        isFormattingEnabled,
        isPivotingEnabled,
        isAttachmentOnly,
      });
    },
    [
      cardIdsToCards,
      selectedCardIds,
      selectedAttachmentType,
      updatePulseCards,
      isFormattingEnabled,
      isPivotingEnabled,
      isAttachmentOnly,
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
    updatePulseCards(attachmentType, newSelectedCardIds, {
      isFormattingEnabled,
      isPivotingEnabled,
      isAttachmentOnly,
    });
  }, [
    allCardIds,
    cardIdsToCards,
    cards.length,
    selectedCardIds,
    selectedAttachmentType,
    updatePulseCards,
    isFormattingEnabled,
    isPivotingEnabled,
    isAttachmentOnly,
  ]);

  const onToggleFormatting = useCallback(() => {
    const newValue = !isFormattingEnabled;
    setIsFormattingEnabled(newValue);
    updatePulseCards(selectedAttachmentType, selectedCardIds, {
      isFormattingEnabled: newValue,
      isPivotingEnabled,
      isAttachmentOnly,
    });
  }, [
    selectedAttachmentType,
    selectedCardIds,
    updatePulseCards,
    isFormattingEnabled,
    isPivotingEnabled,
    isAttachmentOnly,
  ]);

  const onTogglePivoting = useCallback(() => {
    const newValue = !isPivotingEnabled;
    setIsPivotingEnabled(newValue);
    updatePulseCards(selectedAttachmentType, selectedCardIds, {
      isFormattingEnabled,
      isPivotingEnabled: newValue,
      isAttachmentOnly,
    });
  }, [
    selectedAttachmentType,
    selectedCardIds,
    updatePulseCards,
    isFormattingEnabled,
    isPivotingEnabled,
    isAttachmentOnly,
  ]);

  const onToggleAttachmentOnly = useCallback(() => {
    const newValue = !isAttachmentOnly;
    setIsAttachmentOnly(newValue);
    updatePulseCards(selectedAttachmentType, selectedCardIds, {
      isFormattingEnabled,
      isPivotingEnabled,
      isAttachmentOnly: newValue,
    });
  }, [
    selectedAttachmentType,
    selectedCardIds,
    updatePulseCards,
    isFormattingEnabled,
    isPivotingEnabled,
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
