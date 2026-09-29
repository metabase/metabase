import { t } from "ttag";

import { useDispatch } from "metabase/redux";
import { closeNavItem } from "metabase/redux/app";
import { ActionIcon, Icon } from "metabase/ui";

import {
  PaddedSidebarLink,
  SidebarHeading,
  SidebarSection,
} from "../MainNavbar.styled";
import type { OpenNavItem } from "../types";

type OpenItemsSectionProps = {
  items: OpenNavItem[];
  /** `key` of the item the current route is showing, if any. */
  selectedKey?: string;
};

/**
 * What is currently open, so several things can be held at once and switched between. Closing a
 * row only stops listing it — nothing is discarded, and opening it again brings the row back.
 */
export function OpenItemsSection({
  items,
  selectedKey,
}: OpenItemsSectionProps) {
  const dispatch = useDispatch();

  if (items.length === 0) {
    return null;
  }

  return (
    <SidebarSection role="section" aria-label={t`Open`}>
      <SidebarHeading>{t`Open`}</SidebarHeading>
      {items.map((item) => (
        <PaddedSidebarLink
          key={item.key}
          url={item.url}
          icon={item.icon}
          isSelected={item.key === selectedKey}
          right={
            <ActionIcon
              aria-label={t`Close ${item.name}`}
              color="text-secondary"
              size="sm"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                dispatch(closeNavItem(item.key));
              }}
            >
              <Icon name="close" size={12} />
            </ActionIcon>
          }
        >
          {item.name}
        </PaddedSidebarLink>
      ))}
    </SidebarSection>
  );
}
