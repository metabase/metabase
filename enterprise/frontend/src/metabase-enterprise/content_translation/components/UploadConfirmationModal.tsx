import { useState } from "react";
import { c, t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { Button, Divider, Group, List, Modal, Stack, Text } from "metabase/ui";
import type {
  DictionaryArrayRow,
  RetrievedDictionaryArrayRow,
} from "metabase-types/api/content-translation";

import type { DiffSummary, TranslationDiff } from "../utils/translation-diff";

interface UploadConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  diff: TranslationDiff;
  summary: DiffSummary;
  currentTranslationsHash: string;
}

export const UploadConfirmationModal = ({
  isOpen,
  onClose,
  onConfirm,
  diff,
  summary,
  currentTranslationsHash,
}: UploadConfirmationModalProps) => {
  const [isConfirming, setIsConfirming] = useState(false);

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      await onConfirm();
    } finally {
      setIsConfirming(false);
    }
  };

  const availableLocales = useSetting("available-locales");

  const localeCodeToName = (localeCode: string) =>
    availableLocales?.find(([code, _name]) => code === localeCode)?.[1] ||
    localeCode;

  const formatTranslationKey = (
    translation: DictionaryArrayRow | RetrievedDictionaryArrayRow,
  ) => (
    <>
      {localeCodeToName(translation.locale)}
      {": "}&ldquo;{translation.msgid}&rdquo;
    </>
  );

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title={t`Review changes`}
      size="lg"
      data-testid="confirm-translation-upload-modal"
    >
      <Stack gap="md">
        <div>
          <Text size="sm">
            {c("{0} and {1} are numbers")
              .t`Total translations in upload: ${summary.addedCount + summary.updatedCount + summary.unchangedCount} | Current translations: ${summary.removedCount + summary.updatedCount + summary.unchangedCount}`}
          </Text>
        </div>

        {summary.removedCount > 0 && (
          <div>
            <Text fw="bold" mb="xs">
              {c("{0} is a number")
                .t`${summary.removedCount} translation(s) will be deleted:`}
            </Text>
            <List size="sm" withPadding>
              {diff.removed.map((translation) => (
                <List.Item key={`${translation.locale}-${translation.msgid}`}>
                  {formatTranslationKey(translation)}
                  {" → "}&ldquo;
                  {translation.msgstr}
                  &rdquo;
                </List.Item>
              ))}
            </List>
          </div>
        )}

        {summary.addedCount > 0 && (
          <div>
            <Text fw="bold" mb="xs">
              {c("{0} is a number")
                .t`${summary.addedCount} new translation(s) will be added:`}
            </Text>
            <List size="sm" withPadding>
              {diff.added.map((translation) => (
                <List.Item key={`${translation.locale}-${translation.msgid}`}>
                  {formatTranslationKey(translation)}
                  {" → "}&ldquo;{translation.msgstr}&rdquo;
                </List.Item>
              ))}
            </List>
          </div>
        )}

        {summary.updatedCount > 0 && (
          <div>
            <Text fw="bold" mb="xs">
              {c("{0} is a number")
                .t`${summary.updatedCount} translation(s) will be updated:`}
            </Text>
            <List size="sm" withPadding>
              {diff.updated.map(({ old, new: newTranslation }) => (
                <List.Item key={`${old.locale}-${old.msgid}`}>
                  <Stack gap="xs">
                    <Text size="sm">{formatTranslationKey(old)}</Text>
                    <Text size="sm" c="var(--mb-color-saturated-red)">
                      {t`Old:`} &ldquo;{old.msgstr}&rdquo;
                    </Text>
                    <Text size="sm" c="var(--mb-color-saturated-green)">
                      {t`New:`} &ldquo;{newTranslation.msgstr}&rdquo;
                    </Text>
                  </Stack>
                </List.Item>
              ))}
            </List>
          </div>
        )}

        {summary.unchangedCount > 0 && (
          <Text size="sm">
            {c("{0} is a number")
              .t`${summary.unchangedCount} translation(s) will remain unchanged.`}
          </Text>
        )}

        <Divider />

        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose} disabled={isConfirming}>
            {t`Cancel`}
          </Button>
          <Button
            color="red"
            onClick={handleConfirm}
            loading={isConfirming}
            disabled={isConfirming}
          >
            {t`Replace translations`}
          </Button>
        </Group>

        {/* Hidden field to store the hash for race condition detection */}
        <input
          type="hidden"
          data-testid="translations-hash"
          value={currentTranslationsHash}
        />
      </Stack>
    </Modal>
  );
};
