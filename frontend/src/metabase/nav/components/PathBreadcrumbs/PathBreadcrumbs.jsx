import React, {useState} from "react";
import PropTypes from "prop-types";
import cx from "classnames";

import Icon from "metabase/components/Icon";
import Collection from "metabase/entities/collections";
import CollectionBadge from "metabase/questions/components/CollectionBadge";

import {
  PathSeparator,
  PathContainer,
  ExpandButton,
} from "./PathBreadcrumbs.styled";

function PathBreadcrumbs({ collection, className }) {
  const [isExpanded, setIsExpanded] = useState(false);
  if (!collection) {
    return null;
  }
  const toggle = () => setIsExpanded(!isExpanded);

  const ancestors = collection.effective_ancestors || [];
  const parts =
    ancestors[0]?.id === "root" ? ancestors.splice(0, 1) : ancestors;

  let content;
  if (parts.length > 1 && !isExpanded) {
    content = (
      <>
        <CollectionBadge
          collectionId={parts[0].id}
          inactiveColor={"text-medium"}
        />
        <Separator onClick={toggle} />
        <ExpandButton
          small
          iconOnly
          borderless
          iconSize={10}
          icon="ellipsis"
          className={cx("text-dark")}
          onClick={toggle}
        >
          <span />
        </ExpandButton>
        <Separator onClick={toggle} />
      </>
    );
  } else {
    content = parts.map(collection => (
      <>
        <CollectionBadge
          collectionId={collection.id}
          inactiveColor={"text-medium"}
        />
        <Separator onClick={toggle} />
      </>
    ));
  }
  return (
    <PathContainer>
      {content}
      <CollectionBadge
        collectionId={collection.id}
        inactiveColor={"text-medium"}
      />
    </PathContainer>
  );
}

const propTypes = {
  collection: PropTypes.object,
};

PathBreadcrumbs.propTypes = propTypes;

export default Collection.load({
  id: (state, props) => props.collectionId || "root",
  wrapped: true,
  loadingAndErrorWrapper: false,
  properties: ["name", "authority_level"],
})(PathBreadcrumbs);

const Separator = props => (
  <PathSeparator {...props}>
    <Icon name="chevronright" size={8} />
  </PathSeparator>
);