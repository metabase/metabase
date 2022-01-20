/* eslint-disable react/prop-types */
import React, { useCallback } from "react";
import { connect } from "react-redux";
import _ from "underscore";

import Questions from "metabase/entities/questions";
import Question from "metabase-lib/lib/Question";
import { push } from "react-router-redux";

import { getMetadata } from "metabase/selectors/metadata";
import { question as questionUrl } from "metabase/lib/urls";
import Visualization from "metabase/visualizations/components/Visualization";
import QuestionResultLoader from "metabase/containers/QuestionResultLoader";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { ANALYTICS_CONTEXT } from "metabase/collections/constants";

import { HoverMenu, VizCard } from "./CollectionCardVisualization.styled";

// todo -- move this to containers
const mapStateToProps = (state, props) => ({
  metadata: getMetadata(state),
});

const mapDispatchToProps = {
  push,
};

const HEIGHT = 250;
const style = { minHeight: HEIGHT };

function CollectionCardVisualization({
  item,
  collection,
  metadata,
  dispatch,
  push,
  onCopy,
  onMove,
}) {
  const handlePin = useCallback(() => {
    item.setPinned(false);
  }, [item]);

  const handleCopy = useCallback(() => {
    onCopy([item]);
  }, [item, onCopy]);

  const handleMove = useCallback(() => {
    onMove([item]);
  }, [item, onMove]);

  const handleArchive = useCallback(() => {
    item.setArchived(true);
  }, [item]);

  return (
    <VizCard style={style}>
      <HoverMenu
        item={item}
        onPin={collection.can_write ? handlePin : null}
        onMove={collection.can_write && item.setCollection ? handleMove : null}
        onCopy={item.copy ? handleCopy : null}
        onArchive={
          collection.can_write && item.setArchived ? handleArchive : null
        }
        analyticsContext={ANALYTICS_CONTEXT}
      />
      <Questions.Loader id={item.id}>
        {({ question: card }) => {
          const question = new Question(card, metadata);
          return (
            <QuestionResultLoader question={question}>
              {({ loading, error, reload, ...resultProps }) => {
                const shouldShowLoader = loading && resultProps.results == null;
                return (
                  <LoadingAndErrorWrapper
                    loading={shouldShowLoader}
                    error={error || resultProps?.result?.error}
                    noWrapper
                    style={style}
                  >
                    <Visualization
                      onChangeCardAndRun={({ nextCard }) =>
                        push(questionUrl(nextCard))
                      }
                      onChangeLocation={push}
                      isDashboard
                      showTitle
                      metadata={metadata}
                      height={HEIGHT}
                      dispatch={dispatch}
                      {...resultProps}
                    />
                  </LoadingAndErrorWrapper>
                );
              }}
            </QuestionResultLoader>
          );
        }}
      </Questions.Loader>
    </VizCard>
  );
}

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(CollectionCardVisualization);
