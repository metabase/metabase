import { useDisclosure } from "@mantine/hooks";
import { useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { ModelingSidebarSection } from "metabase/data-studio/pages/ModelingSectionLayout/ModelingSidebar/ModelingSidebarSection";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import type { SemanticLayerSectionProps } from "metabase/plugins";
import type { Collection } from "metabase-types/api";

import { isSemanticLayerCollectionType } from "../../utils";

import { CollectionTree } from "./CollectionTree";
import { CreateCollectionTreeModal } from "./CreateCollectionTreeModal";

export function SemanticLayerSection({
  collections,
  selectedCollectionId,
  hasDataAccess,
  hasNativeWrite,
}: SemanticLayerSectionProps) {
  const [isModalOpened, { open: openModal, close: closeModal }] =
    useDisclosure();
  const dispatch = useDispatch();

  const collection = useMemo(
    () => collections.find(({ type }) => isSemanticLayerCollectionType(type)),
    [collections],
  );

  const handleCreate = (collection: Collection) => {
    dispatch(push(Urls.dataStudioCollection(collection.id)));
  };

  return collection != null ? (
    <CollectionTree
      collection={collection}
      selectedCollectionId={selectedCollectionId}
      hasDataAccess={hasDataAccess}
      hasNativeWrite={hasNativeWrite}
    />
  ) : (
    <>
      <ModelingSidebarSection
        title={t`Semantic layer`}
        icon="repository"
        onClick={openModal}
      />
      {isModalOpened && (
        <CreateCollectionTreeModal
          onCreate={handleCreate}
          onClose={closeModal}
        />
      )}
    </>
  );
}
