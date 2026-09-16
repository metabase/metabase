import { t } from "ttag";

import { ActionIcon, Box, Flex, Icon, Loader, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { MetabotUploadedFile } from "metabase-types/api";

import S from "./MetabotAttachment.module.css";

export function MetabotAttachment({
  filename,
  size,
  attachment,
  uploading,
  disabled,
  onRemove,
}: {
  filename: string;
  size: number;
  attachment?: MetabotUploadedFile;
  uploading?: boolean;
  disabled?: boolean;
  onRemove?: () => void;
}) {
  const fileType = filename.toLowerCase().endsWith(".tsv") ? "TSV" : "CSV";
  const fileSize =
    size < 1024
      ? `${size} B`
      : `${(size / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} KB`;
  const details = (
    <>
      <Text truncate fw="bold" size="sm" title={filename}>
        {filename}
      </Text>
      <Text size="xs" c="text-secondary">
        {uploading ? t`Saving…` : `${fileType} · ${fileSize}`}
      </Text>
    </>
  );
  return (
    <Flex
      className={S.card}
      gap="sm"
      align="center"
      data-testid="metabot-attachment"
    >
      {uploading ? (
        <Loader size="sm" aria-label={t`Saving ${filename}`} />
      ) : (
        <Icon name="table" size={24} c="core-brand" />
      )}
      {attachment ? (
        <Box
          component="a"
          className={S.details}
          href={Urls.model({ id: attachment.card_id, type: "model" })}
          target="_blank"
          rel="noopener noreferrer"
        >
          {details}
        </Box>
      ) : (
        <Box className={S.details}>{details}</Box>
      )}
      {onRemove && (
        <ActionIcon
          variant="subtle"
          size="sm"
          onClick={onRemove}
          disabled={disabled}
          aria-label={t`Remove ${filename}`}
        >
          <Icon name="close" size={12} />
        </ActionIcon>
      )}
    </Flex>
  );
}
