import { Fragment } from "react";

import { Anchor, Group, Text } from "metabase/ui";
import { collection as collectionUrl, transformList } from "metabase/urls";

import { type CollectionPathSegment, TRANSFORMS_ROOT_ID } from "../../utils";

interface CollectionPathProps {
  segments: CollectionPathSegment[];
}

const segmentUrl = (segment: CollectionPathSegment): string =>
  // The Transforms root is a virtual collection (sentinel id -1) with no real
  // collection page, so link it to the transforms list instead of building a
  // dead /collection/-1-... URL.
  segment.id === TRANSFORMS_ROOT_ID
    ? transformList()
    : collectionUrl({ id: segment.id, name: segment.name });

// TODO: see if we can use the CollectionBreadcrumb component here
export const CollectionPath = ({ segments }: CollectionPathProps) => {
  return (
    <Group gap="sm" wrap="wrap">
      {segments.map((segment, index) => (
        <Fragment key={segment.id}>
          {index > 0 && (
            <Text size="sm" c="text-secondary">
              /
            </Text>
          )}
          <Anchor
            href={segmentUrl(segment)}
            target="_blank"
            size="sm"
            c="text-secondary"
            td="none"
          >
            {segment.name}
          </Anchor>
        </Fragment>
      ))}
    </Group>
  );
};
