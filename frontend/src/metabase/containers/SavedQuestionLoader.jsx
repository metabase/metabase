import { useState, useEffect } from "react";
import { connect } from "react-redux";
import _ from "underscore";
import { useAsync } from "react-use";

import { loadMetadataForCard } from "metabase/questions/actions";
import { getMetadata } from "metabase/selectors/metadata";

import Questions from "metabase/entities/questions";
import Question from "metabase-lib/Question";

// type annotations

/*
 * SavedQuestionLaoder
 *
 * Load a saved quetsion and return it to the calling component
 *
 * @example
 *
 * Render prop style
 * import SavedQuestionLoader from 'metabase/containers/SavedQuestionLoader'
 *
 * // assuming
 * class ExampleSavedQuestionFeature extends React.Component {
 *    render () {
 *      return (
 *        <SavedQuestionLoader questionId={this.props.params.questionId}>
 *        { ({ question, loading, error }) => {
 *
 *        }}
 *        </SavedQuestion>
 *      )
 *    }
 * }
 *
 * @example
 *
 * The raw un-connected component is also exported so we can unit test it
 * without the redux store.
 */

const SavedQuestionLoader = ({ children, card, error, loading, metadata }) => {
  const [question, setQuestion] = useState(null);

  const cardMetadataState = useAsync(async () => {
    if (card?.id == null) {
      return;
    }

    await loadMetadataForCard(card);
  }, [card?.id]);

  useEffect(() => {
    if (card?.id == null) {
      return;
    }

    const hasCardMetadataLoaded =
      !cardMetadataState.loading && cardMetadataState.error == null;

    if (!hasCardMetadataLoaded) {
      setQuestion(null);
      return;
    }

    if (!question) {
      setQuestion(new Question(card, metadata));
    }
  }, [card, metadata, cardMetadataState, question]);

  return (
    children?.({
      question,
      loading: loading || cardMetadataState.loading,
      error: error ?? cardMetadataState.error,
    }) ?? null
  );
};

function mapStateToProps(state, props) {
  return {
    metadata: getMetadata(state),
  };
}

const mapDispatchToProps = dispatch => {
  return {
    loadMetadataForCard: card => dispatch(loadMetadataForCard(card)),
  };
};

export default _.compose(
  connect(mapStateToProps, mapDispatchToProps),
  Questions.load({
    id: (_state, props) => props.questionId,
    loadingAndErrorWrapper: false,
    entityAlias: "card",
  }),
)(SavedQuestionLoader);
