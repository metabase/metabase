import React, { useState } from "react";
import { t } from "ttag";
import { Link, NewLink } from "metabase-types/api";
import Button from "metabase/core/components/Button";
import EntityMenu from "metabase/components/EntityMenu";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import * as Urls from "metabase/lib/urls";
import Modal from "metabase/components/Modal";
import HomeLink from "../HomeLink";
import HomeLinkEditModalContent from "../HomeLinkEditModalContent/HomeLinkEditModalContent";
import { HomeLinksSectionHeader } from "./HomeLinksSection.styled";

interface HomeLinksSectionProps {
  links: Link[];
  canEdit: boolean;
  onAddLink: (link: NewLink) => void;
  onEditLink: (link: Link) => void;
  onRemoveLink: (linkId: Link["id"]) => void;
}

const getLinkUrl = (link: Link): string => {
  if (link.type === "external_link") {
    return link.url;
  } else {
    // FIXME: modelToUrl should consume a string
    return Urls.modelToUrl({ model: link.type }) ?? "";
  }
};

const getLinkIcon = (link: Link): string => {
  if (link.type === "external_link") {
    return "link";
  } else {
    return "unknown";
  }
};

const HomeLinksSection = ({
  links,
  canEdit,
  onAddLink,
  onEditLink,
  onRemoveLink,
}: HomeLinksSectionProps) => {
  const [editingLink, setEditingLink] = useState<Link | null>(null);

  const handleEditLinkClick = (link: Link) => {
    setEditingLink(link);
  };

  const handleSaveLinkClick = async (link: NewLink) => {
    if (!editingLink) {
      return;
    }
    await onEditLink({ ...link, id: editingLink.id });
  };

  const handleCancelLinkEditing = () => {
    setEditingLink(null);
  };

  return (
    <section>
      <HomeLinksSectionHeader>
        <h3>{t`Quick links`}</h3>
        {canEdit && (
          <ModalWithTrigger
            triggerElement={<Button onlyText>{t`Add link`}</Button>}
          >
            <HomeLinkEditModalContent
              isNew
              onSubmit={onAddLink}
              onClose={handleCancelLinkEditing}
            />
          </ModalWithTrigger>
        )}
      </HomeLinksSectionHeader>

      {links.map(link => (
        <HomeLink
          isExternal={link.type === "external_link"}
          key={link.id}
          title={link.name}
          description={link.description}
          url={getLinkUrl(link)}
          icon={{ name: getLinkIcon(link) }}
          actions={
            canEdit ? (
              <EntityMenu
                items={[
                  {
                    title: `Edit`,
                    action: () => handleEditLinkClick(link),
                  },
                  {
                    title: `Remove`,
                    action: () => onRemoveLink(link.id),
                  },
                ]}
                triggerIcon="ellipsis"
              />
            ) : undefined
          }
        />
      ))}

      {editingLink != null ? (
        <Modal onClose={handleCancelLinkEditing}>
          <HomeLinkEditModalContent
            onSubmit={handleSaveLinkClick}
            link={editingLink}
          />
        </Modal>
      ) : null}
    </section>
  );
};

export default HomeLinksSection;
