/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";

import MetabaseSettings from "metabase/lib/settings";
import { canonicalCollectionId } from "metabase/entities/collections";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import AccordionList from "metabase/components/AccordionList";
import Icon from "metabase/components/Icon";

const ICON_SIZE = 16;

export default class CollectionOptionsButton extends React.Component {
  render() {
    if (!MetabaseSettings.enhancementsEnabled()) {
      return null;
    }
    const items = this.popoverOptions();
    if (items.length === 0) {
      return null;
    }
    const { className } = this.props;

    return (
      <div
        className={className}
        // prevent the ellipsis click from selecting the folder also
        onClick={e => e.stopPropagation()}
        // cap the large ellipsis so it doesn't increase the row height
        style={{ height: ICON_SIZE }}
      >
        <PopoverWithTrigger
          triggerElement={
            <Icon name="ellipsis" size={20} className="hover-child" />
          }
        >
          {({ onClose }) => (
            <AccordionList
              className="text-brand"
              sections={[{ items }]}
              onChange={item => {
                item.onClick();
                onClose();
              }}
            />
          )}
        </PopoverWithTrigger>
      </div>
    );
  }

  popoverOptions = () => {
    const { collection, setSidebarState, user } = this.props;
    if (!collection.can_write) {
      return [];
    }
    if (collection.archived) {
      return [
        {
          name: t`Unarchive`,
          onClick: () => collection.setArchived(false),
        },
      ];
    }
    const onEdit = collection =>
      setSidebarState({ modalSnippetCollection: collection });
    const onEditCollectionPermissions = () =>
      setSidebarState({ permissionsModalCollectionId: collection.id });

    const options = [];
    const isRoot = canonicalCollectionId(collection.id) === null;
    if (!isRoot) {
      options.push({
        name: t`Edit folder details`,
        onClick: () => onEdit(collection),
      });
    }
    if (user && user.is_superuser) {
      options.push({
        name: t`Change permissions`,
        onClick: onEditCollectionPermissions,
      });
    }
    if (!isRoot) {
      options.push({
        name: t`Archive`,
        onClick: () => collection.setArchived(true),
      });
    }
    return options;
  };
}
