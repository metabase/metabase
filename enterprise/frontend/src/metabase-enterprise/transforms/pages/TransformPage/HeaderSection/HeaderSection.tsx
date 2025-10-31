import { useState } from "react";
import { t } from "ttag";

import { BrowserCrumbs } from "metabase/common/components/BrowserCrumbs";
import * as Urls from "metabase/lib/urls";
import { RepresentationsModal } from "metabase/representations/RepresentationsModal";
import { Button, Group } from "metabase/ui";
import type { Transform } from "metabase-types/api";

type HeaderSectionProps = {
  transform: Transform;
};

export function HeaderSection({ transform }: HeaderSectionProps) {
  const [isRepresentationsModalOpen, setIsRepresentationsModalOpen] =
    useState(false);

  return (
    <Group justify="space-between">
      <BrowserCrumbs
        crumbs={[
          { title: t`Transforms`, to: Urls.transformList() },
          { title: transform.name, to: Urls.transform(transform.id) },
        ]}
      />
      <Button onClick={() => setIsRepresentationsModalOpen(true)}>
        {t`Representations`}
      </Button>
      <RepresentationsModal
        opened={isRepresentationsModalOpen}
        onClose={() => setIsRepresentationsModalOpen(false)}
        entityId={transform.id}
        entityType="transform"
      />
    </Group>
  );
}
