import React from "react";
import EntityItem from "metabase/components/EntityItem";

export const component = EntityItem;

export const description = `
  Represents an metabase entity with an icon, name and actions
`;
export const examples = {
  Default: <EntityItem name="Example item" iconName="dashboard" />,
  Selectable: (
    <EntityItem name="Example item" iconName="dashboard" selectable />
  ),
  Favorited: <EntityItem name="Example item" iconName="dashboard" isFavorite />,
  Actions: (
    <EntityItem
      name="Example item"
      iconName="dashboard"
      onPin={() => alert("pin")}
      onMove={() => alert("move")}
      onArchive={() => alert("archive")}
    />
  ),
};
