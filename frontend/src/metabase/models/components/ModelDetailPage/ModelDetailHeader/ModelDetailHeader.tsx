import React, { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { Button } from "metabase/core/components/Button";
import EntityMenu from "metabase/components/EntityMenu";
import { Link } from "metabase/core/components/Link";
import Modal from "metabase/components/Modal";

import * as Urls from "metabase/lib/urls";

import ArchiveModelModal from "metabase/questions/containers/ArchiveQuestionModal";
import CollectionMoveModal from "metabase/containers/CollectionMoveModal";

import type { Collection } from "metabase-types/api";

import type Question from "metabase-lib/Question";

import {
  ModelHeader,
  ModelHeaderButtonsContainer,
  ModelTitle,
  ModelFootnote,
} from "./ModelDetailHeader.styled";

interface Props {
  model: Question;
  hasEditDefinitionLink: boolean;
  onChangeName: (name?: string) => void;
  onChangeCollection: (collection: Collection) => void;
}

type HeaderModal = "move" | "archive";

function ModelDetailHeader({
  model,
  hasEditDefinitionLink,
  onChangeName,
  onChangeCollection,
}: Props) {
  const [modal, setModal] = useState<HeaderModal | null>(null);

  const modelCard = model.card();
  const canWrite = model.canWrite();

  const queryEditorLink = Urls.modelEditor(modelCard, { type: "query" });
  const exploreDataLink = Urls.model(modelCard);

  const extraActions = useMemo(() => {
    return [
      {
        title: t`Move`,
        icon: "move",
        action: () => setModal("move"),
      },
      {
        title: t`Archive`,
        icon: "archive",
        action: () => setModal("archive"),
      },
    ];
  }, []);

  const handleCloseModal = useCallback(() => setModal(null), []);

  const handleCollectionChange = useCallback(
    (collection: Collection) => {
      onChangeCollection(collection);
      handleCloseModal();
    },
    [onChangeCollection, handleCloseModal],
  );

  const renderModal = useCallback(() => {
    if (modal === "move") {
      return (
        <CollectionMoveModal
          title={t`Which collection should this be in?`}
          initialCollectionId={model.collectionId() || "root"}
          onMove={handleCollectionChange}
          onClose={handleCloseModal}
        />
      );
    }
    if (modal === "archive") {
      return <ArchiveModelModal question={model} onClose={handleCloseModal} />;
    }
    return null;
  }, [modal, model, handleCollectionChange, handleCloseModal]);

  return (
    <>
      <ModelHeader>
        <div>
          <ModelTitle
            initialValue={model.displayName()}
            isDisabled={!canWrite}
            onChange={onChangeName}
          />
          <ModelFootnote>{t`Model`}</ModelFootnote>
        </div>
        <ModelHeaderButtonsContainer>
          {hasEditDefinitionLink && canWrite && (
            <Button as={Link} to={queryEditorLink}>{t`Edit definition`}</Button>
          )}
          <Button primary as={Link} to={exploreDataLink}>{t`Explore`}</Button>
          {canWrite && (
            <EntityMenu items={extraActions} triggerIcon="ellipsis" />
          )}
        </ModelHeaderButtonsContainer>
      </ModelHeader>
      {modal && <Modal onClose={handleCloseModal}>{renderModal()}</Modal>}
    </>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ModelDetailHeader;
