import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { t } from "ttag";

import SavedQuestionHeaderButton from "metabase/query_builder/components/SavedQuestionHeaderButton/SavedQuestionHeaderButton";
import {
  HeaderDivider,
  SavedQuestionHeaderButtonContainer,
  SavedQuestionLeftSideRoot,
  StyledLastEditInfoLabel,
  StyledQuestionDataSource,
  ViewHeaderLeftSubHeading,
  ViewHeaderMainLeftContentContainer,
} from "metabase/query_builder/components/view/ViewHeader/ViewTitleHeader.styled";
import { Flex, HoverCard, Icon, Text, rem } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { HeadBreadcrumbs } from "../HeaderBreadcrumbs";
import { HeaderCollectionBadge } from "../HeaderCollectionBadge";
import { QuestionDataSource } from "../QuestionDataSource";

import CS from "./SavedQuestionLeftSide.module.css";
import { useHiddenSourceTables } from "./util";

interface SavedQuestionLeftSideProps {
  question: Question;
  isObjectDetail?: boolean;
  isAdditionalInfoVisible?: boolean;
  onOpenQuestionInfo: () => void;
  onSave: (newQuestion: Question) => any;
}

export function SavedQuestionLeftSide({
  question,
  isObjectDetail,
  isAdditionalInfoVisible,
  onOpenQuestionInfo,
  onSave,
}: SavedQuestionLeftSideProps): React.JSX.Element {
  const [showSubHeader, setShowSubHeader] = useState(true);

  const hasLastEditInfo = question.lastEditInfo() != null;
  const type = question.type();
  const isModelOrMetric = type === "model" || type === "metric";

  const onHeaderChange = useCallback(
    (name: string) => {
      if (name && name !== question.displayName()) {
        onSave(question.setDisplayName(name));
      }
    },
    [question, onSave],
  );

  const renderDataSource =
    QuestionDataSource.shouldRender({ question, isObjectDetail }) &&
    type === "question";
  const renderLastEdit = hasLastEditInfo && isAdditionalInfoVisible;

  useEffect(() => {
    const timerId = setTimeout(() => {
      if (isAdditionalInfoVisible && (renderDataSource || renderLastEdit)) {
        setShowSubHeader(false);
      }
    }, 4000);
    return () => clearTimeout(timerId);
  }, [isAdditionalInfoVisible, renderDataSource, renderLastEdit]);

  return (
    <SavedQuestionLeftSideRoot
      data-testid="qb-header-left-side"
      showSubHeader={showSubHeader}
    >
      <ViewHeaderMainLeftContentContainer>
        <SavedQuestionHeaderButtonContainer isModelOrMetric={isModelOrMetric}>
          <Flex align="center" gap="sm">
            <HeadBreadcrumbs
              divider={<HeaderDivider>/</HeaderDivider>}
              parts={[
                ...(isAdditionalInfoVisible && isModelOrMetric
                  ? [
                      <HeaderCollectionBadge
                        key="collection"
                        question={question}
                      />,
                    ]
                  : []),

                <SavedQuestionHeaderButton
                  key={question.displayName()}
                  question={question}
                  onSave={onHeaderChange}
                />,
              ]}
            />

            <ReadOnlyTag question={question} />
          </Flex>
        </SavedQuestionHeaderButtonContainer>
      </ViewHeaderMainLeftContentContainer>
      {isAdditionalInfoVisible && (
        <ViewHeaderLeftSubHeading>
          {QuestionDataSource.shouldRender({ question, isObjectDetail }) &&
            !isModelOrMetric && (
              <StyledQuestionDataSource
                question={question}
                isObjectDetail={isObjectDetail}
                originalQuestion={undefined} // can be removed, needed for typings
                subHead
              />
            )}
          {hasLastEditInfo && isAdditionalInfoVisible && (
            <StyledLastEditInfoLabel
              item={question.card()}
              onClick={onOpenQuestionInfo}
            />
          )}
        </ViewHeaderLeftSubHeading>
      )}
    </SavedQuestionLeftSideRoot>
  );
}

export function ReadOnlyTag({ question }: { question: Question }) {
  const { isEditable } = Lib.queryDisplayInfo(question.query());
  const hiddenSourceTables = useHiddenSourceTables(question);

  if (isEditable) {
    return null;
  }

  const tableName = hiddenSourceTables[0]?.displayName;

  return (
    <HoverCard position="bottom-start" disabled={!tableName}>
      <HoverCard.Target>
        <Flex align="center" gap="xs" px={4} py={2} mt={4} className={CS.badge}>
          <Icon name="lock_filled" size={12} />
          <Text size="xs" fw="bold">
            {t`View-only`}
          </Text>
        </Flex>
      </HoverCard.Target>
      <HoverCard.Dropdown>
        <Text
          maw={rem(360)}
          p="md"
        >{t`One of the administrators hid the source table “${tableName}”, making this question view-only.`}</Text>
      </HoverCard.Dropdown>
    </HoverCard>
  );
}
