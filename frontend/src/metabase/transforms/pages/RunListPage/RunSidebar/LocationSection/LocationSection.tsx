import { Link } from "react-router";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import * as Urls from "metabase/lib/urls";
import { Anchor, Breadcrumbs, FixedSizeIcon, Group } from "metabase/ui";
import type { TransformRun } from "metabase-types/api";

type LocationSectionProps = {
  run: TransformRun;
};

export function LocationSection({ run }: LocationSectionProps) {
  const collection = run.transform?.collection;

  if (collection == null) {
    return null;
  }

  return (
    <div role="region" aria-label={t`Location`}>
      <Breadcrumbs
        lh="1rem"
        separator={<FixedSizeIcon name="chevronright" size={12} />}
      >
        <Anchor
          component={Link}
          className={CS.textWrap}
          lh="1rem"
          to={Urls.transformList({ collectionId: collection.id })}
        >
          <Group gap="sm" wrap="nowrap">
            <FixedSizeIcon name="folder" />
            {collection.name}
          </Group>
        </Anchor>
      </Breadcrumbs>
    </div>
  );
}
