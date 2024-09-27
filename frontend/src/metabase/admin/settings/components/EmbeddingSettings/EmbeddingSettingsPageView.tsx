import type { PropsWithChildren } from "react";

import Breadcrumbs from "metabase/components/Breadcrumbs";
import { Stack } from "metabase/ui";

export const EmbeddingSettingsPageView = ({
  children,
  breadcrumbs,
}: PropsWithChildren<{
  breadcrumbs: string[][];
}>) => (
  <Stack spacing="2.5rem" px="md" pt="sm">
    <Breadcrumbs size="large" crumbs={breadcrumbs} />
    {children}
  </Stack>
);
