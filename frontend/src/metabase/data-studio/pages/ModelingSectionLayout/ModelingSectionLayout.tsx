import type { ReactNode } from "react";
import { t } from "ttag";

import { Box, Flex } from "metabase/ui";

import { SectionLayout, SectionTitle } from "../../components/SectionLayout";

import { ModelingSidebar } from "./ModelingSidebar";

type ModelingSectionLayoutProps = {
  children?: ReactNode;
};

export function ModelingSectionLayout({
  children,
}: ModelingSectionLayoutProps) {
  return (
    <SectionLayout
      title={
        <SectionTitle
          title={t`Modeling`}
          description={t`Build your semantic layer`}
        />
      }
    >
      <Flex direction="row" w="100%" h="100%">
        <ModelingSidebar />
        <Box flex={1}>{children}</Box>
      </Flex>
    </SectionLayout>
  );
}
