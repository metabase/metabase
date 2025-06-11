import cx from "classnames";
import { t } from "ttag";

import { ArchivedEntityBanner } from "metabase/archive/components/ArchivedEntityBanner";
import type { CollectionPickerValueItem } from "metabase/common/components/CollectionPicker";
import CS from "metabase/css/core/index.css";
import type { QueryModalType } from "metabase/query_builder/constants";
import { Box, Flex, Transition } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { CardId, Dataset } from "metabase-types/api";
import type { DatasetEditorTab, QueryBuilderMode } from "metabase-types/store";

import { ViewTitleHeader } from "../../ViewHeader";
import ViewSection, { ViewHeading } from "../../ViewSection";

import ViewHeaderContainerS from "./ViewHeaderContainer.module.css";

const fadeIn = {
  in: { opacity: 1 },
  out: { opacity: 0 },
  transitionProperty: "opacity",
};

interface ViewHeaderContainerProps {
  isObjectDetail: boolean;
  isAdditionalInfoVisible: boolean | undefined;
  onOpenQuestionInfo: () => void;
  onSave: (newQuestion: Question) => any;
  onOpenModal: (modalType: QueryModalType) => void;
  isNavBarOpen: boolean;
  originalQuestion: Question | undefined;
  result: Dataset;
  queryBuilderMode: QueryBuilderMode;
  updateQuestion: (question: Question, opts?: { run?: boolean | undefined; } | undefined) => void;
  isBookmarked: boolean;
  toggleBookmark: () => void;
  isRunnable: boolean;
  isRunning: boolean;
  isNativeEditorOpen: boolean;
  isShowingSummarySidebar: boolean;
  isDirty: boolean;
  isResultDirty: boolean;
  isActionListVisible: boolean;
  runQuestionQuery: (opts?: { overrideWithQuestion?: Question | undefined; shouldUpdateUrl?: boolean | undefined; ignoreCache?: boolean | undefined; } | undefined) => void;
  cancelQuery: () => void;
  onEditSummary: () => void;
  onCloseSummary: () => void;
  setQueryBuilderMode: (mode: QueryBuilderMode, opts?: { shouldUpdateUrl?: boolean | undefined; datasetEditorTab?: DatasetEditorTab | undefined; } | undefined) => void;
  isShowingQuestionInfoSidebar: boolean;
  onCloseQuestionInfo: () => void;
  className: string | undefined;
  question: Question;
  onUnarchive: (question: Question) => void;
  onMove: (question: Question, collection: CollectionPickerValueItem) => void;
  onDeletePermanently: (id: CardId) => void;
}

export const ViewHeaderContainer = (props: ViewHeaderContainerProps) => {
  const { question, onUnarchive, onMove, onDeletePermanently } = props;
  const query = question.query();
  const card = question.card();
  const { isNative } = Lib.queryDisplayInfo(query);

  const isNewQuestion = !isNative && Lib.sourceTableOrCardId(query) === null;

  return (
    <Box className={ViewHeaderContainerS.QueryBuilderViewHeaderContainer}>
      {card.archived && (
        <ArchivedEntityBanner
          name={card.name}
          entityType={card.type}
          canMove={card.can_write}
          canRestore={card.can_restore}
          canDelete={card.can_delete}
          onUnarchive={() => onUnarchive(question)}
          onMove={(collection) => onMove(question, collection)}
          onDeletePermanently={() => onDeletePermanently(card.id)}
        />
      )}

      <ViewTitleHeader
        className={cx(ViewHeaderContainerS.BorderedViewTitleHeader, props.className)}
        question={props.question}
        isObjectDetail={props.isObjectDetail}
        isAdditionalInfoVisible={props.isAdditionalInfoVisible}
        onOpenQuestionInfo={props.onOpenQuestionInfo}
        onSave={props.onSave}
        onOpenModal={props.onOpenModal}
        isNavBarOpen={props.isNavBarOpen}
        originalQuestion={props.originalQuestion}
        result={props.result}
        queryBuilderMode={props.queryBuilderMode}
        updateQuestion={props.updateQuestion}
        isBookmarked={props.isBookmarked}
        toggleBookmark={props.toggleBookmark}
        isRunnable={props.isRunnable}
        isRunning={props.isRunning}
        isNativeEditorOpen={props.isNativeEditorOpen}
        isShowingSummarySidebar={props.isShowingSummarySidebar}
        isDirty={props.isDirty}
        isResultDirty={props.isResultDirty}
        isActionListVisible={props.isActionListVisible}
        runQuestionQuery={props.runQuestionQuery}
        cancelQuery={props.cancelQuery}
        onEditSummary={props.onEditSummary}
        onCloseSummary={props.onCloseSummary}
        setQueryBuilderMode={props.setQueryBuilderMode}
        isShowingQuestionInfoSidebar={props.isShowingQuestionInfoSidebar}
        onCloseQuestionInfo={props.onCloseQuestionInfo}
        style={{
          transition: "opacity 300ms linear",
          opacity: isNewQuestion ? 0 : 1,
        }}
      />
      {/*This is used so that the New Question Header is unmounted after the animation*/}
      <Transition mounted={isNewQuestion} transition={fadeIn} duration={300}>
        {(style) => (
          <ViewSection
            className={CS.spread}
            style={{
              ...style,
              borderBottom: "1px solid var(--mb-color-border)",
            }}
          >
            <Flex direction="column" gap="xs">
              <ViewHeading>{t`Pick your starting data`}</ViewHeading>
            </Flex>
          </ViewSection>
        )}
      </Transition>
    </Box>
  );
};
