import React, { useMemo } from "react";
import _ from "underscore";

import { Tree } from "metabase/components/tree";
import { TreeNodeProps } from "metabase/components/tree/types";

import * as Urls from "metabase/lib/urls";
import { CollectionTreeItem } from "metabase/collections/utils";

import { SidebarCollectionLink } from "./SidebarItems";

type Props = {
  currentPathname: string;
  collections: CollectionTreeItem[];
};

function MainNavbarView({ currentPathname, collections }: Props) {
  const CollectionLink = useMemo(() => {
    return React.forwardRef<HTMLLIElement, TreeNodeProps>(
      function CollectionLink(props: TreeNodeProps, ref) {
        const { item } = props;
        const url = Urls.collection(item);
        const isSelected = currentPathname.startsWith(url);
        return (
          <SidebarCollectionLink
            {...props}
            url={url}
            isSelected={isSelected}
            ref={ref}
          />
        );
      },
    );
  }, [currentPathname]);

  return (
    <>
      <Tree data={collections} TreeNode={CollectionLink} />
    </>
  );
}

export default MainNavbarView;
