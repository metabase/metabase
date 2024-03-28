import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { getNoObjectIllustration } from "metabase/selectors/whitelabel";
import type { ImageProps } from "metabase/ui";
import { Image } from "metabase/ui";

export function NoObjectError(props: ImageProps) {
  const noObjectIllustration = useSelector(getNoObjectIllustration);

  return noObjectIllustration ? (
    <Image
      alt={t`No results`}
      width={120}
      height={120}
      src={noObjectIllustration}
      {...props}
    />
  ) : null;
}
