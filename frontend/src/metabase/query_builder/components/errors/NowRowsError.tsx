import { useSelector } from "metabase/lib/redux";
import { getNoQuestionResultsIllustration } from "metabase/selectors/whitelabel";
import { Image } from "metabase/ui";

export function NoRowsError() {
  const noQuestionResultsIllustration = useSelector(
    getNoQuestionResultsIllustration,
  );

  return (
    noQuestionResultsIllustration && (
      <Image
        width={120}
        height={120}
        mb="1rem"
        src={noQuestionResultsIllustration}
      />
    )
  );
}
