/* eslint-disable react/prop-types */
import React, { useEffect, useCallback } from "react";

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

const ArchiveCollectionModal = (props: ArchiveCollectionModalProps) => {
  const archive = useCallback(async () => {
    const { setCollectionArchived, params } = props;
    const id = Urls.extractCollectionId(params.slug);
    await setCollectionArchived({ id }, true);
  }, [props]);

  const close = useCallback(() => {
    const { onClose, object, push } = props;
    onClose();

    if (object.archived) {
      const parent =
        object.effective_ancestors.length > 0
          ? object.effective_ancestors.pop()
          : null;
      push(Urls.collection(parent));
    }
  }, [props]);

  useEffect(() => {
    const { collection } = props;
    if (isPersonalCollection(collection) || !collection.can_write) {
      close();
    }
  }, [props, close]);

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
    id: (state: any, props: any) => Urls.extractCollectionId(props.params.slug),
  }),
)(ArchiveCollectionModal);
