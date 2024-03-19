import { useSelector } from "metabase/lib/redux";
import { getNoQuestionResultsIllustration } from "metabase/selectors/whitelabel";

import { NoRowsErrorIllustration } from "./NowRowsError.styled";

export function NoRowsError() {
  const noQuestionResultsIllustration = useSelector(
    getNoQuestionResultsIllustration,
  );

  return (
    noQuestionResultsIllustration && (
      <NoRowsErrorIllustration
        backgroundImageSrc={noQuestionResultsIllustration}
      />
    )
  );
}
