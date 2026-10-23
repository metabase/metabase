import cx from "classnames";
import { Fragment, type ReactNode, useState } from "react";
import { t } from "ttag";

import { CollectionBadge } from "metabase/common/collections/components/CollectionBadge";
import {
  BREADCRUMB_TRAIL_CLASS_NAME,
  Breadcrumb,
} from "metabase/common/components/Breadcrumb";
import { ActionIcon, Box, Flex, Icon } from "metabase/ui";
import type { CollectionEssentials, IconName } from "metabase-types/api";

/**
 * A collection crumb carries the collection rather than a name and an icon:
 * `effective_ancestors` only reports name, id, personal_owner_id and type, so
 * CollectionBadge has to fetch the rest by id to pick the right icon.
 */
export type BreadcrumbCrumb =
  | {
      kind: "collection";
      collection: CollectionEssentials;
      onClick?: () => void;
    }
  | {
      kind: "static";
      key: string;
      icon: IconName;
      label: string;
      to?: string;
      onClick?: () => void;
    };

type CollectionBreadcrumbsViewProps = {
  /** Collapses to first, ellipsis, last once it holds more than two crumbs. */
  path: BreadcrumbCrumb[];
  /** Pinned after the path, and never collapsed away. */
  terminal?: BreadcrumbCrumb;
  /** When the trail is too narrow, the longest crumbs truncate first and truncated crumbs show a tooltip. */
  truncateLongestFirst?: boolean;
};

const BreadcrumbSeparator = () => (
  <Box
    c="text-disabled"
    fz="0.8em"
    fw="bold"
    mx="0.5rem"
    style={{ userSelect: "none" }}
  >
    /
  </Box>
);

const getCrumbKey = (crumb: BreadcrumbCrumb) =>
  crumb.kind === "collection"
    ? `collection-${crumb.collection.id}`
    : `static-${crumb.key}`;

type CrumbContentProps = {
  crumb: BreadcrumbCrumb;
  showTooltip: boolean;
};

const CrumbContent = ({ crumb, showTooltip }: CrumbContentProps) =>
  crumb.kind === "collection" ? (
    <CollectionBadge
      collectionId={crumb.collection.id}
      showTooltip={showTooltip}
      onClick={crumb.onClick}
    />
  ) : (
    <Breadcrumb
      icon={crumb.icon}
      showTooltip={showTooltip}
      to={crumb.to}
      onClick={crumb.onClick}
    >
      {crumb.label}
    </Breadcrumb>
  );

type TrailItem = { key: string; node: ReactNode };

export const CollectionBreadcrumbsView = ({
  path,
  terminal,
  truncateLongestFirst = false,
}: CollectionBreadcrumbsViewProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const isCollapsed = path.length > 2 && !isExpanded;

  const toTrailItem = (crumb: BreadcrumbCrumb): TrailItem => ({
    key: getCrumbKey(crumb),
    node: <CrumbContent crumb={crumb} showTooltip={truncateLongestFirst} />,
  });

  const pathItems: TrailItem[] = isCollapsed
    ? [
        toTrailItem(path[0]),
        {
          key: "expand",
          node: (
            <ActionIcon
              variant="subtle"
              onClick={() => setIsExpanded(true)}
              aria-label={t`Expand`}
            >
              <Icon name="ellipsis" />
            </ActionIcon>
          ),
        },
        toTrailItem(path[path.length - 1]),
      ]
    : path.map(toTrailItem);

  const items = terminal ? [...pathItems, toTrailItem(terminal)] : pathItems;

  return (
    <Flex
      align="center"
      className={cx({ [BREADCRUMB_TRAIL_CLASS_NAME]: truncateLongestFirst })}
      miw="0"
    >
      {items.map(({ key, node }, index) => (
        <Fragment key={key}>
          {index > 0 && <BreadcrumbSeparator />}
          {node}
        </Fragment>
      ))}
    </Flex>
  );
};
