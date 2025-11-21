import { t } from "ttag";

import { BrowserCrumbs } from "metabase/common/components/BrowserCrumbs";
import * as Urls from "metabase/lib/urls";
import type { Transform } from "metabase-types/api";

type HeaderSectionProps = {
  transform: Transform;
};

export function HeaderSection({ transform }: HeaderSectionProps) {
  return (
    <BrowserCrumbs
      crumbs={[
        { title: t`Transforms`, to: Urls.transformList() },
        { title: transform.name, to: Urls.transform(transform.id) },
      ]}
    />
  );
}
