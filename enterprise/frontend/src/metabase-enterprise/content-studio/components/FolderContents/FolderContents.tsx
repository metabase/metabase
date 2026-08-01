import type { ReactNode } from "react";

import { Link } from "metabase/common/components/Link";
import {
  Box,
  Center,
  Ellipsified,
  Icon,
  type IconProps,
  Loader,
} from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./FolderContents.module.css";

/** A row of a Content Studio folder view: a sub-folder or one of its entities. */
export type ContentStudioFolderItem = {
  id: string;
  name: string;
  icon: IconName | IconProps;
  url: string;
};

type FolderContentsProps = {
  items: ContentStudioFolderItem[];
  isLoading: boolean;
  emptyState: ReactNode;
};

export function FolderContents({
  items,
  isLoading,
  emptyState,
}: FolderContentsProps) {
  if (isLoading) {
    return (
      <Center py="lg">
        <Loader data-testid="loading-indicator" />
      </Center>
    );
  }

  if (items.length === 0) {
    return <>{emptyState}</>;
  }

  return (
    <Box
      component="ul"
      className={S.list}
      data-testid="content-studio-folder-contents"
    >
      {items.map((item) => (
        <Box component="li" key={item.id}>
          <Link to={item.url} aria-label={item.name} className={S.row}>
            <Icon
              {...(typeof item.icon === "string"
                ? { name: item.icon }
                : item.icon)}
            />
            <Ellipsified>{item.name}</Ellipsified>
          </Link>
        </Box>
      ))}
    </Box>
  );
}
