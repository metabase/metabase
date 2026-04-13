import { t } from "ttag";

import { getNoObjectIllustration } from "metabase/selectors/whitelabel";
import type { ImageProps } from "metabase/ui";
import { Image } from "metabase/ui";
import { useSelector } from "metabase/utils/redux";

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
