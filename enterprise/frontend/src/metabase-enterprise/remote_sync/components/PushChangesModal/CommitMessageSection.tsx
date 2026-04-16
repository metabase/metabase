import { t } from "ttag";

import { Box, Text, Textarea } from "metabase/ui";

interface CommitMessageSectionProps {
  value: string;
  onChange: (value: string) => void;
}

export const CommitMessageSection = ({
  value,
  onChange,
}: CommitMessageSectionProps) => (
  <Box>
    <Textarea
      value={value}
      label={<Text mb="xs">{t`Describe your changes`}</Text>}
      onChange={(e) => onChange(e.target.value)}
      placeholder={t`What did you change and why?`}
      minRows={3}
      maxRows={5}
      styles={{
        input: {
          fontSize: "0.875rem",
        },
      }}
    />
    <Text size="xs" c="text-secondary" mt="sm">
      {t`This message will be visible in your Git history`}
    </Text>
  </Box>
);
