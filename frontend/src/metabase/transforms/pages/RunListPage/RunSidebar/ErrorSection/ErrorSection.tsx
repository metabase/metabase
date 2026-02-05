import { t } from "ttag";

import { CodeEditor } from "metabase/common/components/CodeEditor";
import { CopyButton } from "metabase/common/components/CopyButton";
import { Box, Stack, Title } from "metabase/ui";
import type { TransformRun } from "metabase-types/api";

import S from "./ErrorSection.module.css";

type ErrorSectionProps = {
  run: TransformRun;
};

export function ErrorSection({ run }: ErrorSectionProps) {
  if (run.message == null) {
    return null;
  }

  return (
    <Stack role="region" aria-label={t`Error`}>
      <Title order={5}>{t`Error`}</Title>
      <Box className={S.codeContainer} pos="relative" pr="lg">
        <CodeEditor value={run.message} readOnly />
        <Box p="sm" pos="absolute" right={0} top={0}>
          <CopyButton value={run.message} />
        </Box>
      </Box>
    </Stack>
  );
}
