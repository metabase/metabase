import { t } from "ttag";

import { useSelector } from "metabase/redux";
import type { ImageProps } from "metabase/ui";
import { Image } from "metabase/ui";
import { getNoDataIllustration } from "metabase/whitelabel";

export function NoDataError(props: ImageProps) {
  const noDataIllustration = useSelector(getNoDataIllustration);

  return noDataIllustration ? (
    <Image
      alt={t`No results`}
      w={120}
      h={120}
      src={noDataIllustration}
      {...props}
    />
  ) : null;
}
