import type { Location } from "history";
import { type ReactNode, useContext, useLayoutEffect } from "react";
import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";
import * as Urls from "metabase/lib/urls";
import { Box, Flex } from "metabase/ui";
import { DataStudioContext } from "metabase-enterprise/data-studio/common/contexts/DataStudioContext";

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

  const { isSidebarOpened, setIsSidebarOpened, setIsSidebarAvailable } =
    useContext(DataStudioContext);

  usePageTitle(t`Modeling`);

  useLayoutEffect(() => {
    setIsSidebarOpened(true);
    setIsSidebarAvailable(true);
    return () => {
      setIsSidebarOpened(false);
      setIsSidebarAvailable(false);
    };
  }, [setIsSidebarOpened, setIsSidebarAvailable]);

  return (
    <SectionLayout title={<SectionTitle title={t`Modeling`} />}>
      <Flex direction="row" w="100%" h="100%">
        {isSidebarOpened && (
          <ModelingSidebar
            selectedCollectionId={collectionId}
            selectedSnippetId={snippetId}
            isGlossaryActive={isGlossaryActive}
          />
        )}
        <Box flex={1} miw={0}>
          {children}
        </Box>
      </Flex>
    </SectionLayout>
  );
}
