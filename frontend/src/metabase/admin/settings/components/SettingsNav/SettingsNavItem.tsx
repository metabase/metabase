import { useDisclosure } from "@mantine/hooks";
import React, { type ReactElement } from "react";

import {
  AdminNavItem,
  type AdminNavItemProps,
} from "metabase/admin/components/AdminNav";
import { getUserIsAdmin, isSettingsManagerPath } from "metabase/current-user";
import { useSelector } from "metabase/redux";
import { useLocation } from "metabase/router";

/**
 * Find the child whose path is the best (longest) prefix match for the current
 * pathname, or null if no child matches at all. An exact match always wins.
 */
const findBestMatchingChild = (
  children: ReactElement[],
  pathname: string,
): ReactElement | null => {
  let best: ReactElement | null = null;
  let bestLen = 0;

  for (const child of children) {
    // Unjustified type cast. FIXME
    const childPath = child?.props?.path as string | undefined;
    if (!childPath) {
      continue;
    }
    const full = `/admin/settings/${childPath}`;
    if (pathname === full || pathname.startsWith(`${full}/`)) {
      if (full.length > bestLen) {
        best = child;
        bestLen = full.length;
      }
    }
  }

  return best;
};

function getNavChildPath(child: ReactElement): string | undefined {
  const props = child.props;
  if (typeof props !== "object" || props === null || !("path" in props)) {
    return undefined;
  }
  return typeof props.path === "string" ? props.path : undefined;
}

export function SettingsNavItem({
  path,
  folderPattern,
  active: activeOverride,
  children: childrenProp,
  ...navItemProps
}: AdminNavItemProps & { active?: boolean }) {
  const isAdmin = useSelector(getUserIsAdmin);
  // Unjustified type cast. FIXME
  const allChildren = React.Children.toArray(childrenProp) as ReactElement[];
  const children = isAdmin
    ? allChildren
    : allChildren.filter((child) =>
        isSettingsManagerPath(getNavChildPath(child)),
      );
  const currentPath = useLocation().pathname;
  const [isOpen, { toggle: toggleOpen }] = useDisclosure(
    folderPattern ? currentPath.includes(folderPattern) : false,
  );

  const isVisible =
    isAdmin || isSettingsManagerPath(path) || children.length > 0;
  if (!isVisible) {
    return null;
  }

  const bestChild = findBestMatchingChild(children, currentPath);
  const hasActiveDescendant = bestChild != null;

  const fullPath = `/admin/settings/${path}`;
  const showActive =
    activeOverride ??
    ((!isOpen && hasActiveDescendant) || currentPath === fullPath);

  return (
    <AdminNavItem
      data-testid={`settings-sidebar-link`}
      path={path ? `/admin/settings/${path}` : ""}
      folderPattern={folderPattern}
      opened={isOpen}
      active={showActive}
      onClick={toggleOpen}
      {...navItemProps}
    >
      {children.length > 0
        ? children.map((child) =>
            child?.props?.path
              ? // Unjustified type cast. FIXME
                React.cloneElement(child, {
                  active: child === bestChild,
                } as any)
              : child,
          )
        : childrenProp}
    </AdminNavItem>
  );
}
