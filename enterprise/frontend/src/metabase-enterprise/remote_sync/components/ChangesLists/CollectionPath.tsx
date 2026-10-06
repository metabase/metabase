import { Fragment } from "react";

import { Anchor, Group, Text } from "metabase/ui";
import {
  collection as collectionUrl,
  dataAppsSettings,
  transformList,
} from "metabase/urls";

import { DATA_APPS_ROOT_ID } from "../../displayGroups";
import { type CollectionPathSegment, TRANSFORMS_ROOT_ID } from "../../utils";

interface CollectionPathProps {
  segments: CollectionPathSegment[];
}

const segmentUrl = (segment: CollectionPathSegment): string => {
  // The Transforms and Data apps roots are virtual collections (sentinel ids)
  // with no real collection page, so link them to their list pages instead of
  // building a dead /collection/-1-... URL.
  if (segment.id === TRANSFORMS_ROOT_ID) {
    return transformList();
  }
  if (segment.id === DATA_APPS_ROOT_ID) {
    return dataAppsSettings();
  }
  return collectionUrl({ id: segment.id, name: segment.name });
};

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
