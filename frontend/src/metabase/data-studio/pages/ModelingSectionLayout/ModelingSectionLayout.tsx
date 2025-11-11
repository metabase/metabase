import type { Location } from "history";
import type { ReactNode } from "react";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { Box, Flex } from "metabase/ui";

import { SectionLayout, SectionTitle } from "../../components/SectionLayout";

import { ModelingSidebar } from "./ModelingSidebar";

type ModelingSectionLayoutProps = {
  children?: ReactNode;
  location: Location;
  params?: {
    collectionId?: string;
    snippetId?: string;
  };
};

export function ModelingSectionLayout({
  children,
  location,
  params,
}: ModelingSectionLayoutProps) {
  const isGlossaryActive = location.pathname === Urls.dataStudioGlossary();
  const isSegmentsActive = location.pathname.startsWith(
    Urls.dataStudioSegments(),
  );

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
        <ModelingSidebar
          collectionId={params?.collectionId}
          snippetId={params?.snippetId}
          isGlossaryActive={isGlossaryActive}
          isSegmentsActive={isSegmentsActive}
        />
        <Box flex={1}>{children}</Box>
      </Flex>
    </SectionLayout>
  );
}
