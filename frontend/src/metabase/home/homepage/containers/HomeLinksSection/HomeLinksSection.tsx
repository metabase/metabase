import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { State } from "metabase-types/store";
import { Link, NewLink } from "metabase-types/api";
import HomeLinksSection from "../../components/HomeLinksSection/HomeLinksSection";

let linkIndex = 1;

export const linksStubData: Link[] = [
  {
    id: linkIndex++,
    type: "external_link",
    name: "Metabase.com website",
    description: null,
    url: "https://metabase.com",
  },
  {
    id: linkIndex++,
    type: "external_link",
    name: "Google.com website",
    description: null,
    url: "https://google.com",
  },
  {
    id: linkIndex++,
    type: "external_link",
    name: "LinkedIn.com website",
    description: null,
    url: "https://linkedin.com",
  },
];

const HomeLinksSectionContainer = () => {
  // Stub for now
  const canEdit = true;
  const [links, setLinks] = useState(linksStubData);

  const handleAddLink = (link: NewLink) =>
    setLinks(prevLinks => [
      ...prevLinks,
      { id: linkIndex++, ...link, type: "external_link" },
    ]);

  const handleEditLink = (editedLink: Link) =>
    setLinks(prevLinks =>
      prevLinks.map(link => {
        if (link.id === editedLink.id) {
          return editedLink;
        }
        return link;
      }),
    );

  const handleRemoveLink = (linkId: Link["id"]) =>
    setLinks(prevLinks => prevLinks.filter(link => link.id !== linkId));

  return (
    <HomeLinksSection
      links={links}
      canEdit={canEdit}
      onAddLink={handleAddLink}
      onEditLink={handleEditLink}
      onRemoveLink={handleRemoveLink}
    />
  );
};

export default HomeLinksSectionContainer;
