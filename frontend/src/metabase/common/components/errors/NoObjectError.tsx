import { t } from "ttag";

import { useSelector } from "metabase/redux";
import type { ImageProps } from "metabase/ui";
import { Image } from "metabase/ui";
import { getNoObjectIllustration } from "metabase/whitelabel";

export function NoObjectError(props: ImageProps) {
  const noObjectIllustration = useSelector(getNoObjectIllustration);

  return noObjectIllustration ? (
    <Image
      alt={t`No results`}
      w={120}
      h={120}
      src={noObjectIllustration}
      {...props}
    />
  ) : null;
}
