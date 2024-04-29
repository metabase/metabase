import styled from "@emotion/styled";
import classNames from "classnames";
import type { AnchorHTMLAttributes, MutableRefObject, FC } from "react";
import { forwardRef, useLayoutEffect, useRef, useState } from "react";

import {
  ResponsiveChild,
  ResponsiveContainer,
} from "metabase/components/ResponsiveContainer/ResponsiveContainer";
import { useAreAnyTruncated } from "metabase/hooks/use-is-truncated";
import { color } from "metabase/lib/colors";
import resizeObserver from "metabase/lib/resize-observer";
import * as Urls from "metabase/lib/urls";
import type { AnchorProps, FlexProps } from "metabase/ui";
import { Anchor, FixedSizeIcon, Flex, Group, Text, Tooltip } from "metabase/ui";
import type { Collection } from "metabase-types/api";

import { getCollectionName } from "../utils";

export const CollectionBreadcrumbsWithTooltip = ({
  collection,
  containerName,
}: {
  collection: Collection;
  containerName: string;
}) => {
  const collections = (collection.effective_ancestors || []).concat(collection);
  const pathString = collections
    .map(coll => getCollectionName(coll))
    .join(" / ");
  const ellipsifyPath = collections.length > 2;
  const shownCollections = ellipsifyPath
    ? [collections[0], collections[collections.length - 1]]
    : collections;
  const justOneShown = shownCollections.length === 1;

  const { areAnyTruncated, ref } = useAreAnyTruncated<HTMLAnchorElement>();

  const initialEllipsisRef = useRef<HTMLDivElement | null>(null);
  const [
    isFirstCollectionDisplayedAsEllipsis,
    setIsFirstCollectionDisplayedAsEllipsis,
  ] = useState(false);

  useLayoutEffect(() => {
    const initialEllipsis = initialEllipsisRef.current;
    if (!initialEllipsis) {
      return;
    }
    const handleResize = () => {
      // The initial ellipsis might be hidden via CSS,
      // so we need to check whether it is displayed via getComputedStyle
      const style = window.getComputedStyle(initialEllipsis);
      setIsFirstCollectionDisplayedAsEllipsis(style.display !== "none");
    };
    resizeObserver.subscribe(initialEllipsis, handleResize);
    return () => {
      resizeObserver.unsubscribe(initialEllipsis, handleResize);
    };
  }, [initialEllipsisRef]);

  const isTooltipEnabled =
    areAnyTruncated || ellipsifyPath || isFirstCollectionDisplayedAsEllipsis;

  const maxWidths = getBreadcrumbMaxWidths(shownCollections, 96, ellipsifyPath);

  return (
    <Tooltip
      disabled={!isTooltipEnabled}
      variant="multiline"
      label={pathString}
    >
      <ResponsiveContainer
        aria-label={pathString}
        data-testid={`collection-breadcrumbs-for-collection: ${collection.name}`}
        name={containerName}
        w="auto"
      >
        <Flex align="center" w="100%" lh="1" style={{ flexFlow: "row nowrap" }}>
          <FixedSizeIcon name="folder" style={{ marginInlineEnd: ".5rem" }} />
          {shownCollections.map((collection, index) => {
            const key = `collection${collection.id}`;
            return (
              <Group spacing={0} style={{ flexFlow: "row nowrap" }} key={key}>
                {index > 0 && <PathSeparator />}
                <CollectionBreadcrumbsWrapper
                  containerName={containerName}
                  style={{ alignItems: "center" }}
                  w="auto"
                  display="flex"
                >
                  {index === 0 && !justOneShown && (
                    <Ellipsis
                      ref={initialEllipsisRef}
                      includeSep={false}
                      className="initial-ellipsis"
                    />
                  )}
                  {index > 0 && ellipsifyPath && <Ellipsis />}
                  <Breadcrumb
                    href={Urls.collection(collection)}
                    className={classNames("breadcrumb", `for-index-${index}`, {
                      "sole-breadcrumb": collections.length === 1,
                    })}
                    ref={(el: HTMLAnchorElement) => ref.current.set(key, el)}
                    maw={maxWidths[index]}
                    key={collection.id}
                  >
                    {getCollectionName(collection)}
                  </Breadcrumb>
                </CollectionBreadcrumbsWrapper>
              </Group>
            );
          })}
        </Flex>
      </ResponsiveContainer>
    </Tooltip>
  );
};

/** @template T The type of the value the ref will hold */
type RefProp<T> = { ref: MutableRefObject<T> | ((el: T) => void) };

export const Breadcrumb = styled(Anchor)<
  AnchorProps &
    AnchorHTMLAttributes<HTMLAnchorElement> &
    RefProp<HTMLAnchorElement>
>`
  color: ${color("text-dark")};
  line-height: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-top: 1px;
  padding-bottom: 1px;
  :hover {
    color: ${color("brand")};
    text-decoration: none;
  }
`;

export const CollectionBreadcrumbsWrapper = styled(ResponsiveChild)`
  line-height: 1;
  ${props => {
    const breakpoint = "10rem";
    return `
    .initial-ellipsis {
      display: none;
    }
    @container ${props.containerName} (width < ${breakpoint}) {
      .ellipsis-and-separator {
        display: none;
      }
      .initial-ellipsis {
        display: inline;
      }
      .for-index-0:not(.sole-breadcrumb) {
        display: none;
      }
      .breadcrumb {
        max-width: calc(95cqw - 3rem) ! important;
      }
      .sole-breadcrumb {
        max-width: calc(95cqw - 1rem) ! important;
      }
    }
    `;
  }}
`;

type EllipsisProps = {
  includeSep?: boolean;
} & FlexProps;
const Ellipsis: FC<EllipsisProps & Partial<RefProp<HTMLDivElement | null>>> =
  forwardRef<HTMLDivElement, EllipsisProps>(
    ({ includeSep = true, ...flexProps }, ref) => (
      <Flex
        ref={ref}
        align="center"
        className="ellipsis-and-separator"
        {...flexProps}
      >
        <Text lh={1}>…</Text>
        {includeSep && <PathSeparator />}
      </Flex>
    ),
  );
Ellipsis.displayName = "Ellipsis";

const PathSeparator = () => (
  <Text color="text-light" mx="xs" py={1}>
    /
  </Text>
);

const getBreadcrumbMaxWidths = (
  collections: Collection["effective_ancestors"],
  totalUnitsOfWidthAvailable: number,
  isPathEllipsified: boolean,
) => {
  if (!collections || collections.length < 2) {
    return [];
  }
  const lengths = collections.map(
    collection => getCollectionName(collection).length,
  );
  const ratio = lengths[0] / (lengths[0] + lengths[1]);
  const firstWidth = Math.max(
    Math.round(ratio * totalUnitsOfWidthAvailable),
    25,
  );
  const secondWidth = totalUnitsOfWidthAvailable - firstWidth;
  const padding = isPathEllipsified ? "2rem" : "1rem";
  return [
    `calc(${firstWidth}cqw - ${padding})`,
    `calc(${secondWidth}cqw - ${padding})`,
  ];
};
