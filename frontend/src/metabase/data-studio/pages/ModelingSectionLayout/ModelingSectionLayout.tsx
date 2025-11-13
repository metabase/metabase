import type { Location } from "history";
import type { ReactNode } from "react";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { Box, Flex } from "metabase/ui";

import { SectionLayout, SectionTitle } from "../../components/SectionLayout";

import { ModelingSidebar } from "./ModelingSidebar";

type ModelingSectionLayoutParams = {
  collectionId?: string;
  snippetId?: string;
};

type ModelingSectionLayoutProps = {
  params: ModelingSectionLayoutParams;
  location: Location;
  children?: ReactNode;
};

export function ModelingSectionLayout({
  params,
  location,
  children,
}: ModelingSectionLayoutProps) {
  const collectionId = Urls.extractCollectionId(params?.collectionId);
  const snippetId = Urls.extractEntityId(params?.snippetId);
  const isGlossaryActive = location.pathname === Urls.dataStudioGlossary();

  return (
    <SectionLayout title={<SectionTitle title={t`Modeling`} />}>
      <Flex direction="row" w="100%" h="100%">
        <ModelingSidebar
          selectedCollectionId={collectionId}
          selectedSnippetId={snippetId}
          isGlossaryActive={isGlossaryActive}
        />
        <Box flex={1}>{children}</Box>
      </Flex>
    </SectionLayout>
  );
}
