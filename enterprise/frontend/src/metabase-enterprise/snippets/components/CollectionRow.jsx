/* eslint-disable react/prop-types */
import cx from "classnames";
import { Component } from "react";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import CS from "metabase/css/core/index.css";
import { SnippetCollections } from "metabase/entities/snippet-collections";
import { Icon } from "metabase/ui";

import { SnippetCollectionMenu } from "./SnippetCollectionMenu";

const ICON_SIZE = 16;

class CollectionRow extends Component {
  render() {
    const {
      snippetCollection: collection,
      setSnippetCollectionId,
      setSidebarState,
    } = this.props;
    const onSelectCollection = () => {
      if (setSnippetCollectionId) {
        setSnippetCollectionId(collection.id);
      }
    };

    return (
      <div
        className={cx(
          { [cx(CS.bgLightHover, CS.cursorPointer)]: !collection.archived },
          CS.hoverParent,
          CS.hoverVisibility,
          CS.flex,
          CS.alignCenter,
          CS.py2,
          CS.px3,
          CS.textBrand,
        )}
        {...(collection.archived ? undefined : { onClick: onSelectCollection })}
      >
        <Icon
          name="folder"
          size={ICON_SIZE}
          style={{ opacity: 0.25 }}
          className={CS.flexNoShrink}
        />
        <Ellipsified className={cx(CS.flexFull, CS.ml1, CS.textBold)} flex={1}>
          {collection.name}
        </Ellipsified>
        <SnippetCollectionMenu
          className={CS.flexNoShrink}
          collection={collection}
          onEditDetails={() => {
            setSidebarState({ modalSnippetCollection: collection });
          }}
          onChangePermissions={() => {
            setSidebarState({ permissionsModalCollectionId: collection.id });
          }}
        />
      </div>
    );
  }
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SnippetCollections.load({
  id: (state, props) => props.item.id,
  wrapped: true,
})(CollectionRow);
