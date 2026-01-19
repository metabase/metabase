import { t } from "ttag";

import { CopyButton } from "metabase/common/components/CopyButton";
import { Button, Flex, Group, Icon, Stack, Text } from "metabase/ui";

import { AIAnalysisContent } from "../AIAnalysisContent/AIAnalysisContent";

export interface AIAnalysisContentWrapperProps {
  title: string;
  explanation?: string;
  isLoading: boolean;
  onClose?: () => void;
}

export function AIAnalysisContentWrapper({
  title,
  explanation,
  isLoading,
  onClose,
}: AIAnalysisContentWrapperProps) {
  return (
    <Stack h="100%" p="lg" style={{ overflowY: "auto" }}>
      <Group justify="space-between" align="center">
        <Flex align="center" gap="xs">
          <Icon name="metabot" />
          <Text fz="1.17em" ml="xs" fw="bold">
            {title}
          </Text>
        </Flex>
        <Group gap="xs">
          {explanation && (
            <CopyButton
              value={explanation}
              aria-label={t`Copy`}
              style={{ color: "var(--mb-color-text-secondary)" }}
            />
          )}
          {onClose && (
            <Button
              variant="subtle"
              size="compact-sm"
              p={4}
              onClick={onClose}
              aria-label={t`Close`}
              c="text-secondary"
            >
              <Icon name="close" size={16} />
            </Button>
          )}
        </Group>
      </Group>
      <AIAnalysisContent explanation={explanation} isLoading={isLoading} />
    </Stack>
  );
}
