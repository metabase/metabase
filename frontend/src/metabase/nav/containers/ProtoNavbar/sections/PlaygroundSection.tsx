import type { Location } from "history";
import { useMemo } from "react";
import { t } from "ttag";

import { useListCollectionsTreeQuery } from "metabase/api";
import { Tree } from "metabase/common/components/tree";
import { useSelector } from "metabase/redux";
import { getUserPersonalCollectionId } from "metabase/selectors/user";
import * as Urls from "metabase/urls";
import { extractCollectionIdFromPath } from "metabase/urls/collections";
import type { IconName } from "metabase-types/api";

import {
  SidebarCollectionLink,
  SidebarLink,
} from "../../MainNavbar/SidebarItems";
import { isCollectionPath } from "../../MainNavbar/getSelectedItems";
import { SubNavHeading, SubNavSection } from "../SubNav";

type Props = { location: Location };

type HistoryItem = {
  icon: IconName;
  title: string;
  url: string;
};

function getFakeHistoryItems(): HistoryItem[] {
  return [
    {
      icon: "sql",
      title: t`Orders by region`,
      url: "/question/42-orders-by-region",
    },
    {
      icon: "sparkles",
      title: t`What drove revenue growth last quarter?`,
      url: "/question/ask",
    },
    {
      icon: "notebook",
      title: t`Customer count by plan`,
      url: "/question/17-customer-count-by-plan",
    },
    {
      icon: "sparkles",
      title: t`Show me churn by cohort`,
      url: "/question/ask",
    },
    {
      icon: "sql",
      title: t`Weekly active users trend`,
      url: "/question/88-weekly-active-users",
    },
  ];
}

export function PlaygroundSection({ location }: Props) {
  const personalCollectionId = useSelector(getUserPersonalCollectionId);
  const { data: collectionsTree = [] } = useListCollectionsTreeQuery({
    "exclude-other-user-collections": true,
    "exclude-archived": true,
  });

  const { personalCollection, personalCollectionTree, initialExpandedIds } =
    useMemo(() => {
      const personal = collectionsTree.find(
        (collection) => collection.id === personalCollectionId,
      );

      if (!personal) {
        return {
          personalCollection: undefined,
          personalCollectionTree: [],
          initialExpandedIds: undefined,
        };
      }

      const children = personal.children ?? [];

      return {
        personalCollection: personal,
        personalCollectionTree:
          children.length > 0 ? [{ ...personal, children }] : [],
        initialExpandedIds: children.length > 0 ? [personal.id] : undefined,
      };
    }, [collectionsTree, personalCollectionId]);

  const selectedCollectionId = useMemo(() => {
    if (!isCollectionPath(location.pathname)) {
      return undefined;
    }
    return extractCollectionIdFromPath(location.pathname);
  }, [location.pathname]);

  const historyItems = getFakeHistoryItems();
  const personalCollectionHeading =
    personalCollection?.name ?? t`Personal collection`;

  return (
    <>
      <SubNavSection>
        <SubNavHeading>{personalCollectionHeading}</SubNavHeading>
        {personalCollectionTree.length > 0 ? (
          <Tree
            data={personalCollectionTree}
            selectedId={selectedCollectionId}
            initialExpandedIds={initialExpandedIds}
            pinnedExpandedIds={initialExpandedIds}
            TreeNode={SidebarCollectionLink}
            role="tree"
            aria-label="personal-collection-tree"
          />
        ) : personalCollection ? (
          <SidebarLink
            icon="folder"
            url={Urls.collection(personalCollection)}
            isSelected={selectedCollectionId === personalCollection.id}
          >
            {personalCollection.name}
          </SidebarLink>
        ) : null}
      </SubNavSection>

      <SubNavSection>
        <SubNavHeading>{t`History`}</SubNavHeading>
        {historyItems.map((item) => (
          <SidebarLink
            key={item.title}
            icon={item.icon}
            url={item.url}
            isSelected={location.pathname === item.url}
          >
            {item.title}
          </SidebarLink>
        ))}
      </SubNavSection>
    </>
  );
}
