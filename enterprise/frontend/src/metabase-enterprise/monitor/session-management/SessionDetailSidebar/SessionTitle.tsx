import { t } from "ttag";

import { Stack, Text, Title } from "metabase/ui";

import { getSessionUserName } from "../utils";

import type { SessionTitleProps } from "./types";

export const SessionTitle = ({ user }: SessionTitleProps) => (
  <Stack gap={0}>
    <Text size="sm" c="text-secondary">
      {t`Session`}
    </Text>
    <Title order={3} c="text-primary">
      {getSessionUserName(user)}
    </Title>
  </Stack>
);
