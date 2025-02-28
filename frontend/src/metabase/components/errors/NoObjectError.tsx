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
      w={120}
      h={120}
      src={noObjectIllustration}
      {...props}
    />
  ) : null;
}
