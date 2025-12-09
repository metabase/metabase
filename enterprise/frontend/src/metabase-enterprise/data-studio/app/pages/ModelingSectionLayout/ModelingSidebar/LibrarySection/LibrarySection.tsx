import { useDisclosure } from "@mantine/hooks";
import { useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { isLibraryCollection } from "metabase/collections/utils";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getUserIsAdmin } from "metabase/selectors/user";
import { CreateLibraryModal } from "metabase-enterprise/data-studio/common/components/CreateLibraryModal";
import type { Collection, CollectionId } from "metabase-types/api";

import { ModelingSidebarSection } from "../ModelingSidebarSection";

import { LibraryCollectionTree } from "./LibraryCollectionTree";

export type LibrarySectionProps = {
  collections: Collection[];
  selectedCollectionId: CollectionId | undefined;
  hasDataAccess: boolean;
  hasNativeWrite: boolean;
};

export function LibrarySection({
  collections,
  selectedCollectionId,
  hasDataAccess,
}: LibrarySectionProps) {
  const isAdmin = useSelector(getUserIsAdmin);
  const [isModalOpened, { open: openModal, close: closeModal }] =
    useDisclosure();
  const dispatch = useDispatch();

  const rootCollection = useMemo(
    () => collections.find(isLibraryCollection),
    [collections],
  );

  const handleCreate = (collection: Collection) => {
    closeModal();
    dispatch(push(Urls.dataStudioCollection(collection.id)));
  };

  if (rootCollection != null) {
    return (
      <LibraryCollectionTree
        rootCollection={rootCollection}
        selectedCollectionId={selectedCollectionId}
        hasDataAccess={hasDataAccess}
      />
    );
  }

  if (isAdmin) {
    return (
      <>
        <ModelingSidebarSection
          title={t`Library`}
          icon="repository"
          onClick={openModal}
        />
        <CreateLibraryModal
          isOpened={isModalOpened}
          onCreate={handleCreate}
          onClose={closeModal}
        />
      </>
    );
  }

  return null;
}
