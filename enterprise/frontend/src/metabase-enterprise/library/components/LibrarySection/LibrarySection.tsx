import { useDisclosure } from "@mantine/hooks";
import { useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { isLibraryCollection } from "metabase/collections/utils";
import { ModelingSidebarSection } from "metabase/data-studio/pages/ModelingSectionLayout/ModelingSidebar/ModelingSidebarSection";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import type { LibrarySectionProps } from "metabase/plugins";
import { getUserIsAdmin } from "metabase/selectors/user";
import type { Collection } from "metabase-types/api";

import { CreateLibraryModal } from "./CreateLibraryModal";
import { LibraryCollectionTree } from "./LibraryCollectionTree";

export function LibrarySection({
  collections,
  selectedCollectionId,
  hasDataAccess,
  hasNativeWrite,
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
        hasNativeWrite={hasNativeWrite}
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
        {isModalOpened && (
          <CreateLibraryModal onCreate={handleCreate} onClose={closeModal} />
        )}
      </>
    );
  }

  return null;
}
