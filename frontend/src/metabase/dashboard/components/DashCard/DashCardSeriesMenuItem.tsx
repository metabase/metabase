import { type MouseEvent, useState } from "react";

import { Menu } from "metabase/ui";
import * as Urls from "metabase/urls";

const HREF_PLACEHOLDER = "#";

type DashCardSeriesMenuItemProps = {
  name: string;
  getHref?: () => string | undefined;
  onOpen: () => void;
};

export const DashCardSeriesMenuItem = ({
  name,
  getHref,
  onOpen,
}: DashCardSeriesMenuItemProps) => {
  const [href, setHref] = useState<string | undefined>(HREF_PLACEHOLDER);

  if (!getHref) {
    return <Menu.Item onClick={onOpen}>{name}</Menu.Item>;
  }

  const handleUpdateHref = () => {
    const url = getHref();
    setHref(url && Urls.getSubpathSafeUrl(url));
  };

  const handleClick = (event: MouseEvent) => {
    event.preventDefault();
    onOpen();
  };

  return (
    <Menu.Item
      component="a"
      href={href}
      onClick={handleClick}
      onFocus={handleUpdateHref}
      onMouseEnter={handleUpdateHref}
    >
      {name}
    </Menu.Item>
  );
};
