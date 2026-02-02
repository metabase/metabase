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

  // Use refs to access latest state in updatePulseCards without stale closures
  const isFormattingEnabledRef = useRef(isFormattingEnabled);
  const isPivotingEnabledRef = useRef(isPivotingEnabled);
  const isAttachmentOnlyRef = useRef(isAttachmentOnly);

  useEffect(() => {
    isFormattingEnabledRef.current = isFormattingEnabled;
  }, [isFormattingEnabled]);
  useEffect(() => {
    isPivotingEnabledRef.current = isPivotingEnabled;
  }, [isPivotingEnabled]);
  useEffect(() => {
    isAttachmentOnlyRef.current = isAttachmentOnly;
  }, [isAttachmentOnly]);

  const updatePulseCards = useCallback(
    (attachmentType: AttachmentType, cardIds: Set<string>) => {
      const isXls = attachmentType === "xlsx";
      const isCsv = attachmentType === "csv";

      setSelectedAttachmentType(attachmentType);

      setPulse({
        ...pulse,
        cards: pulse.cards.map((card) => ({
          ...card,
          include_csv: cardIds.has(getCardIdPair(card)) && isCsv,
          include_xls: cardIds.has(getCardIdPair(card)) && isXls,
          format_rows: isCsv && isFormattingEnabledRef.current,
          pivot_results:
            card.display === "pivot" && isPivotingEnabledRef.current,
        })),
        channels: pulse.channels.map((channel) => ({
          ...channel,
          details: {
            ...channel.details,
            attachment_only: isAttachmentOnlyRef.current,
          },
        })),
      });
    },
    [pulse, setPulse],
  );

  // Sync state from cards on mount and when cards/pulse change
  const isInitialMount = useRef(true);
  useEffect(() => {
    const newState = calculateStateFromCards(cards, pulse);

    if (isInitialMount.current) {
      isInitialMount.current = false;
      setIsEnabled(newState.isEnabled);
      setSelectedAttachmentType(newState.selectedAttachmentType);
      setSelectedCardIds(newState.selectedCardIds);
      setIsFormattingEnabled(newState.isFormattingEnabled);
      setIsPivotingEnabled(newState.isPivotingEnabled);
      setIsAttachmentOnly(newState.isAttachmentOnly);
      return;
    }

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
    (includeAttachment: boolean) => {
      if (!includeAttachment) {
        const emptySet = new Set<string>();
        updatePulseCards(selectedAttachmentType, emptySet);
        setSelectedCardIds(emptySet);
      }

      setIsEnabled(includeAttachment);
      setIsAttachmentOnly((prev) => (includeAttachment ? prev : false));
    },
    [selectedAttachmentType, updatePulseCards],
  );

  const setAttachmentType = useCallback(
    (format: ExportFormat) => {
      if (format === "csv" || format === "xlsx") {
        updatePulseCards(format, selectedCardIds);
      }
    },
    [selectedCardIds, updatePulseCards],
  );

  const onToggleCard = useCallback(
    (card: SubscriptionSupportingCard) => {
      setSelectedCardIds((prev) => {
        const id = getCardIdPair(card);
        const attachmentType =
          getAttachmentTypeFor(cardIdsToCards(prev)) || selectedAttachmentType;

        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }

        updatePulseCards(attachmentType, next);
        return next;
      });
    },
    [cardIdsToCards, selectedAttachmentType, updatePulseCards],
  );

  const onToggleAll = useCallback(() => {
    setSelectedCardIds((prev) => {
      const attachmentType =
        getAttachmentTypeFor(cardIdsToCards(prev)) || selectedAttachmentType;
      const newSelectedCardIds =
        cards.length === prev.size ? new Set<string>() : allCardIds;

      updatePulseCards(attachmentType, newSelectedCardIds);
      return newSelectedCardIds;
    });
  }, [
    allCardIds,
    cardIdsToCards,
    cards.length,
    selectedAttachmentType,
    updatePulseCards,
  ]);

  const onToggleFormatting = useCallback(() => {
    setIsFormattingEnabled((prev) => {
      const next = !prev;
      isFormattingEnabledRef.current = next;
      updatePulseCards(selectedAttachmentType, selectedCardIds);
      return next;
    });
  }, [selectedAttachmentType, selectedCardIds, updatePulseCards]);

  const onTogglePivoting = useCallback(() => {
    setIsPivotingEnabled((prev) => {
      const next = !prev;
      isPivotingEnabledRef.current = next;
      updatePulseCards(selectedAttachmentType, selectedCardIds);
      return next;
    });
  }, [selectedAttachmentType, selectedCardIds, updatePulseCards]);

  const onToggleAttachmentOnly = useCallback(() => {
    setIsAttachmentOnly((prev) => {
      const next = !prev;
      isAttachmentOnlyRef.current = next;
      updatePulseCards(selectedAttachmentType, selectedCardIds);
      return next;
    });
  }, [selectedAttachmentType, selectedCardIds, updatePulseCards]);

  const canConfigurePivoting = cards.some((card) => card.display === "pivot");
  const areAllSelected = cards.length === selectedCardIds.size;
  const areOnlySomeSelected =
    selectedCardIds.size > 0 && selectedCardIds.size < cards.length;

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
