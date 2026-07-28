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
      px="md"
      py="0.75rem"
      justify="space-between"
      align="flex-start"
      bg="background-secondary"
      bdrs="md"
    >
      <Stack gap="sm">
        {codes.map((code, index) => (
          <Box key={index} ff="mono" fz="sm" lh="1rem">
            {code}
          </Box>
        ))}
      </Stack>
      <CopyButton value={codes.join("\n")}>
        {({ copy, copied }) => (
          <Tooltip label={copied ? t`Copied!` : t`Copy`}>
            <ActionIcon size="xs" m={-1} aria-label={t`Copy`} onClick={copy}>
              <FixedSizeIcon name="copy" />
            </ActionIcon>
          </Tooltip>
        )}
      </CopyButton>
    </Group>
  );
}
