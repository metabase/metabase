import { t } from "ttag";

import { Avatar } from "metabase/common/components/UserAvatar";
import {
  ActionIcon,
  Box,
  Flex,
  Icon,
  Loader,
  Stack,
  Text,
  Title,
  Tooltip,
} from "metabase/ui";
import type { PreviewNotificationTemplateResponse } from "metabase-types/api";

import S from "./PreviewTemplatePanel.module.css";

interface PreviewTemplatePanelProps {
  onClose: () => void;
  isLoading: boolean;
  error: any;
  previewContent?: PreviewNotificationTemplateResponse["rendered"];
}

export const PreviewTemplatePanel = ({
  onClose,
  isLoading,
  error,
  previewContent,
}: PreviewTemplatePanelProps) => {
  const htmlContent = previewContent?.body?.[0]?.content;

  return (
    <Flex
      direction="column"
      mah="100%"
      gap="md"
      className={S.root}
      data-testid="preview-template-panel"
    >
      <Flex gap="sm" align="center" h="1.625rem" className={S.header}>
        <Icon name="eye" size={16} />
        <Title size="h4">{t`Email message preview`}</Title>
        <Tooltip label={t`Close Preview`}>
          <ActionIcon variant="transparent" ml="auto">
            <Icon
              name="arrow_left_to_line"
              size={20}
              onClick={onClose}
              className={S.closePreviewIcon}
            />
          </ActionIcon>
        </Tooltip>
      </Flex>
      <Box p={0} className={S.scrollBox}>
        {isLoading && (
          <Flex align="center" justify="center" gap="sm" py="md">
            <Loader size={12} />
            <Text
              size="lg"
              lh="1.25rem"
              c="text-medium"
            >{t`Loading preview...`}</Text>
          </Flex>
        )}
        {error && (
          <code style={{ color: "var(--mb-color-error)" }}>{error}</code>
        )}
        {previewContent && !error ? (
          <Stack className={S.previewStack}>
            <Box className={S.previewHeader}>
              <Avatar>{previewContent.from || "?"}</Avatar>

              <Box className={S.previewDetails}>
                <Text size="sm" fw={600}>
                  {t`From:`}
                </Text>
                <Text size="sm">{previewContent.from}</Text>

                {previewContent.bcc && previewContent.bcc.length > 0 && (
                  <>
                    <Text size="sm" fw={600}>
                      {t`BCC:`}
                    </Text>
                    <Text size="sm">{previewContent.bcc.join(", ")}</Text>
                  </>
                )}

                <Text size="sm" fw={600}>
                  {t`Subject:`}
                </Text>
                <Text size="sm">{previewContent.subject}</Text>
              </Box>
            </Box>
            {htmlContent ? (
              <div
                className={S.previewBody}
                dangerouslySetInnerHTML={{ __html: htmlContent }}
              />
            ) : (
              <Text c="text-medium">{t`(No body content)`}</Text>
            )}
          </Stack>
        ) : (
          !isLoading &&
          !error && <Text c="text-medium">{t`No preview available.`}</Text>
        )}
      </Box>
    </Flex>
  );
};
