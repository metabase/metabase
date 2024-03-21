import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { getNoQuestionResultsIllustration } from "metabase/selectors/whitelabel";
import type { ImageProps } from "metabase/ui";
import { Image } from "metabase/ui";

export function NoRowsError(props: ImageProps) {
  const noQuestionResultsIllustration = useSelector(
    getNoQuestionResultsIllustration,
  );

  return noQuestionResultsIllustration ? (
    <Image
      alt={t`No results`}
      width={120}
      height={120}
      src={noQuestionResultsIllustration}
      {...props}
    />
  ) : null;
}
