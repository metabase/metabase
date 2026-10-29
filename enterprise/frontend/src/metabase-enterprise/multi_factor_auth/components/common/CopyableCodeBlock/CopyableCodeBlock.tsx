import { t } from "ttag";

import {
  ActionIcon,
  Box,
  CopyButton,
  FixedSizeIcon,
  Group,
  Stack,
  Tooltip,
} from "metabase/ui";

type CopyableCodeBlockProps = {
  codes: string[];
};

export function CopyableCodeBlock({ codes }: CopyableCodeBlockProps) {
  return (
    <Group
      px="lg"
      py="sm"
      justify="space-between"
      align="flex-start"
      bg="background_page-secondary"
      bdrs="sm"
    >
      <Stack gap={0}>
        {codes.map((code, index) => (
          <Box key={index} ff="mono" fz="sm" lh="1.5rem">
            {code}
          </Box>
        ))}
      </Stack>
      <CopyButton value={codes.join("\n")}>
        {({ copy, copied }) => (
          <Tooltip label={copied ? t`Copied!` : t`Copy`}>
            <ActionIcon
              variant="subtle"
              size="sm"
              aria-label={t`Copy`}
              onClick={copy}
            >
              <FixedSizeIcon name="copy" />
            </ActionIcon>
          </Tooltip>
        )}
      </CopyButton>
    </Group>
  );
}
