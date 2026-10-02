import { t } from "ttag";

import { Stack, Text, Title } from "metabase/ui";

import { getOAuthClientName } from "../utils";

import type { ClientTitleProps } from "./types";

export const ClientTitle = ({ client }: ClientTitleProps) => (
  <Stack gap={0}>
    <Text size="sm" c="text-secondary">
      {t`OAuth client`}
    </Text>
    <Title order={3} c="text-primary">
      {getOAuthClientName(client)}
    </Title>
  </Stack>
);
