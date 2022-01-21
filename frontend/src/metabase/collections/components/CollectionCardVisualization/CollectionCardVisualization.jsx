import React from "react";
import PropTypes from "prop-types";
import _ from "underscore";

import Questions from "metabase/entities/questions";
import Question from "metabase-lib/lib/Question";
import Visualization, {
  ERROR_MESSAGE_GENERIC,
  ERROR_MESSAGE_PERMISSION,
} from "metabase/visualizations/components/Visualization";
import QuestionResultLoader from "metabase/containers/QuestionResultLoader";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import { ItemLink } from "../PinnedItemCard/PinnedItemCard.styled";
import { HoverMenu, VizCard } from "./CollectionCardVisualization.styled";

const propTypes = {
  item: PropTypes.object.isRequired,
  collection: PropTypes.object.isRequired,
  metadata: PropTypes.object.isRequired,
  onCopy: PropTypes.func.isRequired,
  onMove: PropTypes.func.isRequired,
};

function CollectionCardVisualization({
  item,
  collection,
  metadata,
  onCopy,
  onMove,
}) {
  return (
    <ItemLink to={item.getUrl()}>
      <VizCard flat>
        <HoverMenu
          item={item}
          collection={collection}
          onCopy={onCopy}
          onMove={onMove}
        />
        <Questions.Loader id={item.id}>
          {({ question: card }) => {
            const question = new Question(card, metadata);
            return (
              <QuestionResultLoader question={question}>
                {({ loading, error, reload, rawSeries, results, result }) => {
                  const shouldShowLoader = loading && results == null;
                  const { errorMessage, errorIcon } = getErrorProps(
                    error,
                    result,
                  );

                  return (
                    <LoadingAndErrorWrapper
                      loading={shouldShowLoader}
                      noWrapper
                    >
                      <Visualization
                        onChangeCardAndRun={_.noop}
                        isDashboard
                        showTitle
                        metadata={metadata}
                        error={errorMessage}
                        errorIcon={errorIcon}
                        rawSeries={rawSeries}
                      />
                    </LoadingAndErrorWrapper>
                  );
                }}
              </QuestionResultLoader>
            );
          }}
        </Questions.Loader>
      </VizCard>
    </ItemLink>
  );
}

CollectionCardVisualization.propTypes = propTypes;

export default CollectionCardVisualization;

function getErrorProps(error, result) {
  error = error || result?.error;
  let errorMessage;
  let errorIcon;
  if (error) {
    if (error.status === 403) {
      errorMessage = ERROR_MESSAGE_PERMISSION;
    } else {
      errorMessage = ERROR_MESSAGE_GENERIC;
    }
    errorIcon = "warning";
  }

  return { errorMessage, errorIcon };
}
