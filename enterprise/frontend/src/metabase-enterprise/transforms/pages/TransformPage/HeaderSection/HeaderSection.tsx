import { t } from "ttag";

import { BrowserCrumbs } from "metabase/common/components/BrowserCrumbs";
import type { Transform } from "metabase-types/api";

import { getTransformListUrl, getTransformUrl } from "../../../urls";

type HeaderSectionProps = {
  transform: Transform;
};

export function HeaderSection({ transform }: HeaderSectionProps) {
  return (
    <BrowserCrumbs
      crumbs={[
        { title: t`Transforms`, to: getTransformListUrl() },
        { title: transform.name, to: getTransformUrl(transform.id) },
      ]}
    />
  );
}
