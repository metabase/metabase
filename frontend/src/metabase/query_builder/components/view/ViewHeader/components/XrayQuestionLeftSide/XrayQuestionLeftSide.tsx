import { useQuestionFromCard } from "metabase/metadata-store";
import { Box, Flex } from "metabase/ui";
import type { Card } from "metabase-types/api";

import { ViewHeading, ViewSubHeading } from "../../../ViewSection";
import ViewTitleHeaderS from "../../ViewTitleHeader.module.css";
import { shouldRenderAdhocDescription } from "../AdHocQuestionDescription/AdHocQuestionDescription";
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
  // an edited chart without a summary (e.g. drilled to raw rows) is titled by its data source already
  const hasSubHeading = !isEdited || shouldRenderAdhocDescription({ question });

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
      {hasSubHeading && (
        <ViewSubHeading className={ViewTitleHeaderS.ViewHeaderLeftSubHeading}>
          <QuestionDataSource question={question} subHead />
        </ViewSubHeading>
      )}
    </Box>
  );
}
