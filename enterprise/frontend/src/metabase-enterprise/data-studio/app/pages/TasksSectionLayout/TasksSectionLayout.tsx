import type { ReactNode } from "react";
import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";
import { Box, Stack } from "metabase/ui";

import { SectionLayout, SectionTitle } from "../../components/SectionLayout";

type TasksSectionLayoutProps = {
  children?: ReactNode;
};

export function TasksSectionLayout({ children }: TasksSectionLayoutProps) {
  usePageTitle(t`Unreferenced items`);

  return (
    <SectionLayout title={<SectionTitle title={t`Unreferenced items`} />}>
      <Stack h="100%" gap={0}>
        <Box flex={1} mih={0} bg="bg-light">
          {children}
        </Box>
      </Stack>
    </SectionLayout>
  );
}
