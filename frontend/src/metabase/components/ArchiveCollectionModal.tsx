/* eslint-disable react/prop-types */
import React, { useEffect, useCallback, useState } from "react";

import _ from "underscore";

import { connect } from "react-redux";
import { withRouter } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import ArchiveModal from "metabase/components/ArchiveModal";

import * as Urls from "metabase/lib/urls";

import Collection from "metabase/entities/collections";
import { Collection as ICollection } from "metabase-types/api";
import { isPersonalCollection } from "metabase/collections/utils";

const mapDispatchToProps = {
  setCollectionArchived: Collection.actions.setArchived,
  push,
};

interface ArchiveCollectionModalProps {
  setCollectionArchived: any;
  params: { slug: string };
  onClose: () => void;
  object: any;
  push: (url: string) => void;
  collection: ICollection;
}

const ArchiveCollectionModal = ({
  params,
  onClose,
  object,
  push,
  collection,
  setCollectionArchived,
}: ArchiveCollectionModalProps) => {
  const archive = useCallback(async () => {
    const id = Urls.extractCollectionId(params.slug);
    await setCollectionArchived({ id }, true);
  }, [params, setCollectionArchived]);

  const close = useCallback(
    (archived?: boolean) => {
      onClose();
      if (archived) {
        const parent =
          object.effective_ancestors.length > 0
            ? object.effective_ancestors.pop()
            : null;
        push(Urls.collection(parent));
      }
    },
    [object, push, onClose],
  );

  useEffect(() => {
    if (isPersonalCollection(collection) || !collection.can_write) {
      close();
    }
  }, [collection, close]);

  return (
    <ArchiveModal
      title={t`Archive this collection?`}
      message={t`The dashboards, collections, and pulses in this collection will also be archived.`}
      onClose={close}
      onArchive={archive}
    />
  );
};

export default _.compose(
  connect(undefined, mapDispatchToProps),
  withRouter,
  Collection.load({
    id: (state: any, props: ArchiveCollectionModalProps) =>
      Urls.extractCollectionId(props.params.slug),
  }),
)(ArchiveCollectionModal);
