import React, { useState, useMemo, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import Icon from "metabase/components/Icon";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import { useDebouncedValue } from "metabase/hooks/use-debounced-value";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import EmptyState from "metabase/components/EmptyState";

import {
  LoadMoreButton,
  LoadMoreRow,
  SearchContainer,
  SearchInput,
  QuestionListContainer,
  EmptyStateContainer,
} from "./QuestionList.styled";
import { QuestionListItem } from "./QuestionListItem";
import { isQuestionCompatible } from "./utils";

const LOAD_CHUNK_SIZE = 15;

const propTypes = {
  questions: PropTypes.object,
  badQuestions: PropTypes.object,
  enabledQuestions: PropTypes.object,
  error: PropTypes.string,
  onSelect: PropTypes.func,
  dashcard: PropTypes.object,
  dashcardData: PropTypes.object,
  loadMetadataForQueries: PropTypes.function,
  visualization: PropTypes.object,
  isLoadingMetadata: PropTypes.bool,
};

export const QuestionList = React.memo(function QuestionList({
  questions,
  badQuestions,
  enabledQuestions,
  error,
  onSelect,
  dashcard,
  dashcardData,
  loadMetadataForQueries,
  visualization,
  isLoadingMetadata,
}) {
  const [searchText, setSearchText] = useState("");
  const debouncedSearchText = useDebouncedValue(
    searchText,
    SEARCH_DEBOUNCE_DURATION,
  );

  const handleSearchFocus = () => {
    MetabaseAnalytics.trackStructEvent(
      "Dashboard",
      "Edit Series Modal",
      "search",
    );
  };

  const filteredQuestions = useMemo(() => {
    const filterText = debouncedSearchText.toLowerCase();
    const filteredQuestions = questions.filter(question =>
      question
        .displayName()
        .toLowerCase()
        .includes(filterText),
    );

    filteredQuestions.sort((a, b) => {
      if (!a.isNative()) {
        return 1;
      } else if (!b.isNative()) {
        return -1;
      } else {
        return 0;
      }
    });

    return filteredQuestions;
  }, [questions, debouncedSearchText]);

  const compatibleQuestions = useMemo(
    () =>
      filteredQuestions?.filter(question =>
        isQuestionCompatible(visualization, dashcard, dashcardData, question),
      ),
    [dashcard, dashcardData, filteredQuestions, visualization],
  );

  const questionsWithoutMetadata = useMemo(
    () =>
      filteredQuestions.filter(
        question => question.isStructured() && !question.query().hasMetadata(),
      ),
    [filteredQuestions],
  );

  const handleLoadNext = useCallback(async () => {
    if (questionsWithoutMetadata.length === 0) {
      return;
    }

    const questionsChunk = questionsWithoutMetadata.slice(0, LOAD_CHUNK_SIZE);

    await loadMetadataForQueries(
      questionsChunk.map(question => question.query()),
    );
  }, [loadMetadataForQueries, questionsWithoutMetadata]);

  useEffect(() => {
    handleLoadNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredQuestions.length]);

  const hasQuestionsToShow = !!(compatibleQuestions.length > 0);

  return (
    <>
      <SearchContainer>
        <SearchInput
          value={searchText}
          colorScheme="transparent"
          icon={<Icon name="search" size={16} pt="0.25rem" />}
          placeholder={t`Search for a question`}
          onFocus={handleSearchFocus}
          onChange={value => setSearchText(value)}
        />
      </SearchContainer>
      <LoadingAndErrorWrapper
        className="flex flex-full overflow-auto"
        loading={!filteredQuestions}
        error={error}
        noBackground
      >
        <QuestionListContainer>
          {hasQuestionsToShow &&
            compatibleQuestions.map((question, index) => {
              const isLoadMoreRow = !!(index === compatibleQuestions.length);
              if (isLoadMoreRow) {
                return (
                  <LoadMoreRow>
                    <LoadMoreButton
                      onClick={handleLoadNext}
                      disabled={isLoadingMetadata}
                    >
                      {isLoadingMetadata ? t`Loading` : t`Load more`}
                    </LoadMoreButton>
                  </LoadMoreRow>
                );
              }

              const isEnabled = enabledQuestions[question.id()];
              const isBad = badQuestions[question.id()];
              return (
                <QuestionListItem
                  key={`compatible-question_${index}`}
                  question={question}
                  isEnabled={isEnabled}
                  isBad={isBad}
                  onChange={e => onSelect(question, e.target.checked)}
                />
              );
            })}
          {!hasQuestionsToShow && (
            <EmptyStateContainer>
              <EmptyState message={t`Nothing here`} icon="all" />
            </EmptyStateContainer>
          )}
        </QuestionListContainer>
      </LoadingAndErrorWrapper>
    </>
  );
});

QuestionList.propTypes = propTypes;
