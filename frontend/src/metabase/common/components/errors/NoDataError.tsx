import { t } from "ttag";

import { getNoDataIllustration } from "metabase/selectors/whitelabel";
import type { ImageProps } from "metabase/ui";
import { Image } from "metabase/ui";
import { useSelector } from "metabase/utils/redux";

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
