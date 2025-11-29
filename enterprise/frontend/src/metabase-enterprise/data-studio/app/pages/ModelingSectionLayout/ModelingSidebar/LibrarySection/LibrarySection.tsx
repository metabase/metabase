import { useDisclosure } from "@mantine/hooks";
import { skipToken } from "@reduxjs/toolkit/query";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Box, Skeleton } from "metabase/ui";
import {
  useGetLibraryCollectionQuery,
  useGetLibraryCollectionTreeQuery,
} from "metabase-enterprise/api";
import { ModelingSidebarSection } from "metabase-enterprise/data-studio/app/pages/ModelingSectionLayout/ModelingSidebar/ModelingSidebarSection";
import type { Collection, CollectionId } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

import { CreateLibraryModal } from "./CreateLibraryModal";
import { LibraryCollectionTree } from "./LibraryCollectionTree";
import S from "./LibrarySection.module.css";

export type LibrarySectionProps = {
  selectedCollectionId: CollectionId | undefined;
  hasDataAccess: boolean;
  hasNativeWrite: boolean;
};

export function LibrarySection({
  selectedCollectionId,
  hasDataAccess,
  hasNativeWrite,
}: LibrarySectionProps) {
  const [isModalOpened, { open: openModal, close: closeModal }] =
    useDisclosure();
  const dispatch = useDispatch();

  const {
    data: libraryInfo,
    error: libraryError,
    isLoading: isLoadingLibrary,
  } = useGetLibraryCollectionQuery();

  const libraryExists = isObject(libraryInfo) && "id" in libraryInfo;
  const hasNoAccess = isObject(libraryError) && libraryError.status === 403;

  const { data: libraryTree, isLoading: isLoadingTree } =
    useGetLibraryCollectionTreeQuery(libraryExists ? undefined : skipToken);

  const rootCollection = libraryTree?.[0];

  const handleCreate = (collection: Collection) => {
    closeModal();
    dispatch(push(Urls.dataStudioCollection(collection.id)));
  };

  if (isLoadingLibrary || isLoadingTree) {
    return (
      <Box className={S.section} p="md">
        <Skeleton h={32} radius="xs" />
      </Box>
    );
  }

  if (hasNoAccess) {
    return null;
  }

  if (rootCollection != null) {
    return (
      <Box className={S.section} p="md" data-testid="library-section">
        <LibraryCollectionTree
          rootCollection={rootCollection}
          selectedCollectionId={selectedCollectionId}
          hasDataAccess={hasDataAccess}
          hasNativeWrite={hasNativeWrite}
        />
      </Box>
    );
  }

  return (
    <Box className={S.section} p="md" data-testid="library-section">
      <ModelingSidebarSection
        title={t`Library`}
        icon="repository"
        onClick={openModal}
      />
      {isModalOpened && (
        <CreateLibraryModal onCreate={handleCreate} onClose={closeModal} />
      )}
    </Box>
  );
}
