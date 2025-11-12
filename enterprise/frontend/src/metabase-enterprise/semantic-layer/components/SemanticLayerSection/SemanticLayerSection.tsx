import { useDisclosure } from "@mantine/hooks";
import { useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { ModelingSidebarSection } from "metabase/data-studio/pages/ModelingSectionLayout/ModelingSidebar/ModelingSidebarSection";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import type { SemanticLayerSectionProps } from "metabase/plugins";
import { getUserIsAdmin } from "metabase/selectors/user";
import type { Collection } from "metabase-types/api";

import { isSemanticLayerCollection } from "../../utils";

import { CreateSemanticLayerModal } from "./CreateSemanticLayerModal";
import { SemanticLayerCollectionTree } from "./SemanticLayerCollectionTree";

export function SemanticLayerSection({
  collections,
  selectedCollectionId,
  hasDataAccess,
  hasNativeWrite,
}: SemanticLayerSectionProps) {
  const isAdmin = useSelector(getUserIsAdmin);
  const [isModalOpened, { open: openModal, close: closeModal }] =
    useDisclosure();
  const dispatch = useDispatch();

  const collection = useMemo(
    () => collections.find(isSemanticLayerCollection),
    [collections],
  );

  const handleCreate = (collection: Collection) => {
    closeModal();
    dispatch(push(Urls.dataStudioCollection(collection.id)));
  };

  if (collection != null) {
    return (
      <SemanticLayerCollectionTree
        collection={collection}
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
          <CreateSemanticLayerModal
            onCreate={handleCreate}
            onClose={closeModal}
          />
        )}
      </>
    );
  }

  return null;
}
