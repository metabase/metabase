import React, { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { User } from "metabase-types/api";

import { Tree } from "metabase/components/tree";
import { TreeNodeProps } from "metabase/components/tree/types";

import ProfileLink from "metabase/nav/components/ProfileLink";

import * as Urls from "metabase/lib/urls";
import { CollectionTreeItem } from "metabase/collections/utils";

import { SidebarCollectionLink, SidebarLink } from "./SidebarItems";
import { SidebarHeading, ProfileLinkContainer } from "./MainNavbar.styled";

type Props = {
  currentUser: User;
  currentPathname: string;
  collections: CollectionTreeItem[];
};

const BROWSE_URL = "/browse";
const OTHER_USERS_COLLECTIONS_URL = Urls.collection({ id: "users" });
const ARCHIVE_URL = "/archive";

function MainNavbarView({ currentUser, currentPathname, collections }: Props) {
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
      <ul>
        <SidebarLink
          icon="table_spaced"
          url={BROWSE_URL}
          isSelected={currentPathname.startsWith(BROWSE_URL)}
          data-metabase-event="NavBar;Data Browse"
        >
          {t`Browse data`}
        </SidebarLink>
        {currentUser.is_superuser && (
          <>
            <SidebarLink
              icon="table_spaced"
              url={OTHER_USERS_COLLECTIONS_URL}
              isSelected={currentPathname.startsWith(
                OTHER_USERS_COLLECTIONS_URL,
              )}
            >
              {t`Other users' personal collections`}
            </SidebarLink>
            <SidebarLink
              icon="view_archive"
              url={ARCHIVE_URL}
              isSelected={currentPathname.startsWith(ARCHIVE_URL)}
            >
              {t`View archive`}
            </SidebarLink>
          </>
        )}
      </ul>
      <ProfileLinkContainer>
        <ProfileLink user={currentUser} />
      </ProfileLinkContainer>
    </>
  );
}

export default MainNavbarView;
