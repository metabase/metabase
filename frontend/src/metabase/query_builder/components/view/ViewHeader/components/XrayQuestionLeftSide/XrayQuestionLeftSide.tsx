import { useQuestionFromCard } from "metabase/metadata-store";
import { Box, Flex } from "metabase/ui";
import type { Card } from "metabase-types/api";

import { ViewHeading, ViewSubHeading } from "../../../ViewSection";
import ViewTitleHeaderS from "../../ViewTitleHeader.module.css";
import AdHocQuestionLeftSideS from "../AdHocQuestionLeftSide/AdHocQuestionLeftSide.module.css";
import { QuestionDataSource } from "../QuestionDataSource";
import { QuestionDescription } from "../QuestionDescription";

type XrayQuestionLeftSideProps = {
  /** The x-ray chart's card including any edits. */
  card: Card;
  isEdited: boolean;
};

/**
 * Header title for an x-ray chart on screen: the x-ray's own name until it's
 * filtered or summarized, then a description of what it now shows, over its data source.
 */
export function XrayQuestionLeftSide({
  card,
  isEdited,
}: XrayQuestionLeftSideProps) {
  const question = useQuestionFromCard(card);

  return (
    <Box className={AdHocQuestionLeftSideS.AdHocLeftSideRoot}>
      <Flex align="center" wrap="nowrap">
        <ViewHeading className={ViewTitleHeaderS.AdHocViewHeading}>
          {isEdited ? (
            <QuestionDescription question={question} isNative={false} />
          ) : (
            card.name
          )}
        </ViewHeading>
      </Flex>
      <ViewSubHeading className={ViewTitleHeaderS.ViewHeaderLeftSubHeading}>
        <QuestionDataSource question={question} subHead />
      </ViewSubHeading>
    </Box>
  );
}
