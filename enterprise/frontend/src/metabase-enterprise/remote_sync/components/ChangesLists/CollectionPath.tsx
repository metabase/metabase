import { Fragment } from "react";

import { collection as collectionUrl } from "metabase/lib/urls";
import { Anchor, Group, Text } from "metabase/ui";

import type { CollectionPathSegment } from "../../utils";

interface CollectionPathProps {
  segments: CollectionPathSegment[];
}

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
            href={collectionUrl({
              id: segment.id,
              name: segment.name,
            })}
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
