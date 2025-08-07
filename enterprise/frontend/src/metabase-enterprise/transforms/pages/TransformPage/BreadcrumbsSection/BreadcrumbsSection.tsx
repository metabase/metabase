import { t } from "ttag";

import { BrowserCrumbs } from "metabase/common/components/BrowserCrumbs";
import {
  getTransformListUrl,
  getTransformUrl,
} from "metabase-enterprise/transforms/urls";
import type { Transform } from "metabase-types/api";

type BreadcrumbsSectionProps = {
  transform: Transform;
};

export function BreadcrumbsSection({ transform }: BreadcrumbsSectionProps) {
  return (
    <BrowserCrumbs
      crumbs={[
        { title: t`Transforms`, to: getTransformListUrl() },
        { title: transform.name, to: getTransformUrl(transform.id) },
      ]}
    />
  );
}
