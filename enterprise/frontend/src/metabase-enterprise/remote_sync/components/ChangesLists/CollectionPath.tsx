import { Fragment } from "react";

import { Anchor, Group, Text } from "metabase/ui";
import { collection as collectionUrl } from "metabase/urls";

import { getVirtualRootUrl } from "../../displayGroups";
import type { CollectionPathSegment } from "../../utils";

interface CollectionPathProps {
  segments: CollectionPathSegment[];
}

const segmentUrl = (segment: CollectionPathSegment): string =>
  // Virtual roots (sentinel ids) have no real collection page, so link them to
  // their list pages instead of building a dead /collection/-1-... URL.
  getVirtualRootUrl(segment.id) ??
  collectionUrl({ id: segment.id, name: segment.name });

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
