import cx from "classnames";
import { Fragment, type ReactNode, useState } from "react";
import { t } from "ttag";

import {
  CollectionBadge,
  type CollectionBadgeIcon,
} from "metabase/common/collections/components/CollectionBadge";
import {
  BREADCRUMB_TRAIL_CLASS_NAME,
  Breadcrumb,
} from "metabase/common/components/Breadcrumb";
import { useNavVariant } from "metabase/nav/prototype/use-nav-variant";
import { ActionIcon, Box, Flex, Icon } from "metabase/ui";
import type {
  Collection,
  CollectionEssentials,
  IconName,
} from "metabase-types/api";

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
    c="text-secondary"
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

/** PROTOTYPE: per-crumb icon and weight, for "Modern nav - C". */
type CrumbStyle = {
  /** Collection crumbs: how the icon shows. Static crumbs only hide it. */
  icon: CollectionBadgeIcon;
  isRegularWeight: boolean;
};

const DEFAULT_CRUMB_STYLE: CrumbStyle = {
  icon: { kind: "default" },
  isRegularWeight: false,
};

type CrumbContentProps = {
  crumb: BreadcrumbCrumb;
  showTooltip: boolean;
  style: CrumbStyle;
};

const CrumbContent = ({ crumb, showTooltip, style }: CrumbContentProps) =>
  crumb.kind === "collection" ? (
    <CollectionBadge
      collectionId={crumb.collection.id}
      showTooltip={showTooltip}
      onClick={crumb.onClick}
      icon={style.icon}
      isRegularWeight={style.isRegularWeight}
    />
  ) : (
    <Breadcrumb
      icon={style.icon.kind === "hidden" ? undefined : crumb.icon}
      iconSize={style.icon.kind === "custom" ? style.icon.size : undefined}
      showTooltip={showTooltip}
      to={crumb.to}
      onClick={crumb.onClick}
      isRegularWeight={style.isRegularWeight}
    >
      {crumb.label}
    </Breadcrumb>
  );

type TrailItem = { key: string; node: ReactNode };

const toTrailItem = (
  crumb: BreadcrumbCrumb,
  showTooltip: boolean,
  style: CrumbStyle,
): TrailItem => ({
  key: getCrumbKey(crumb),
  node: <CrumbContent crumb={crumb} showTooltip={showTooltip} style={style} />,
});

/**
 * PROTOTYPE: the icon "Modern nav - C" gives the trail's first crumb: the
 * Library section the trail runs through (Metrics or Datasets), else a
 * bookmarked folder for an official (git-synced) collection, else its own.
 */
function getVariantCFirstCrumbIcon(path: BreadcrumbCrumb[]) {
  const types = path.map((crumb) =>
    crumb.kind === "collection" ? crumb.collection.type : undefined,
  );
  const sectionIcon: IconName | null = types.includes("library-metrics")
    ? "metric"
    : types.includes("library-data")
      ? "grid_2x2_check"
      : null;
  return (collection: Collection): IconName | null =>
    sectionIcon ?? (collection.is_remote_synced ? "folder_bookmark" : null);
}

export const CollectionBreadcrumbsView = ({
  path,
  terminal,
  truncateLongestFirst = false,
}: CollectionBreadcrumbsViewProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { variant } = useNavVariant();

  // PROTOTYPE: "Modern nav - C" shows only the first crumb's icon, at 12px,
  // and sets the crumbs in the regular weight.
  const isVariantC = variant === "modern-nav-c";
  const firstStyle: CrumbStyle = isVariantC
    ? {
        icon: {
          kind: "custom",
          getIcon: getVariantCFirstCrumbIcon(path),
          size: 12,
        },
        isRegularWeight: true,
      }
    : DEFAULT_CRUMB_STYLE;
  const restStyle: CrumbStyle = isVariantC
    ? { icon: { kind: "hidden" }, isRegularWeight: true }
    : DEFAULT_CRUMB_STYLE;

  const isCollapsed = path.length > 2 && !isExpanded;

  const pathItems: TrailItem[] = isCollapsed
    ? [
        toTrailItem(path[0], truncateLongestFirst, firstStyle),
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
        toTrailItem(path[path.length - 1], truncateLongestFirst, restStyle),
      ]
    : path.map((crumb, index) =>
        toTrailItem(
          crumb,
          truncateLongestFirst,
          index === 0 ? firstStyle : restStyle,
        ),
      );

  const items = terminal
    ? [
        ...pathItems,
        toTrailItem(
          terminal,
          truncateLongestFirst,
          path.length === 0 ? firstStyle : restStyle,
        ),
      ]
    : pathItems;

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
