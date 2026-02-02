import { Link } from "react-router";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { useCollectionPath } from "metabase/data-studio/common/hooks/use-collection-path/useCollectionPath";
import * as Urls from "metabase/lib/urls";
import { Anchor, Breadcrumbs, FixedSizeIcon, Group } from "metabase/ui";
import type { TransformRun } from "metabase-types/api";

type LocationSectionProps = {
  run: TransformRun;
};

export function LocationSection({ run }: LocationSectionProps) {
  const collectionId = run.transform?.collection_id ?? null;

  const { path } = useCollectionPath({
    collectionId,
    namespace: "transforms",
  });

  if (collectionId == null || path == null || path.length === 0) {
    return null;
  }

  return (
    <div role="region" aria-label={t`Location`}>
      <Breadcrumbs
        lh="1rem"
        separator={<FixedSizeIcon name="chevronright" size={12} />}
      >
        {path.map((folder, index) => (
          <Anchor
            key={folder.id}
            component={Link}
            className={CS.textWrap}
            lh="1rem"
            to={Urls.transformList({ collectionId: folder.id })}
          >
            <Group gap="sm" wrap="nowrap">
              {index === 0 && <FixedSizeIcon name="folder" />}
              {folder.name}
            </Group>
          </Anchor>
        ))}
      </Breadcrumbs>
    </div>
  );
}
