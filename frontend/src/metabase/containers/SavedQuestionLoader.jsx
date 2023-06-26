/* eslint-disable react/prop-types */
import { useState, useEffect } from "react";
import _ from "underscore";
import { useAsync } from "react-use";

import { useSelector, useDispatch } from "metabase/lib/redux";
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
 */
const SavedQuestionLoader = ({
  children,
  question: loadedQuestion,
  error,
  loading,
}) => {
  const metadata = useSelector(getMetadata);
  const dispatch = useDispatch();
  const [question, setQuestion] = useState(null);

  const cardMetadataState = useAsync(async () => {
    if (loadedQuestion?.id() == null) {
      return;
    }

    await dispatch(loadMetadataForCard(loadedQuestion.card()));
  }, [loadedQuestion?.id()]);

  useEffect(() => {
    if (loadedQuestion?.id() == null) {
      return;
    }

    const hasCardMetadataLoaded =
      !cardMetadataState.loading && cardMetadataState.error == null;

    if (!hasCardMetadataLoaded) {
      setQuestion(null);
      return;
    }

    if (!question) {
      setQuestion(new Question(loadedQuestion.card(), metadata));
    }
  }, [loadedQuestion, metadata, cardMetadataState, question]);

  return (
    children?.({
      question,
      loading: loading || cardMetadataState.loading,
      error: error ?? cardMetadataState.error,
    }) ?? null
  );
};

export default _.compose(
  Questions.load({
    id: (_state, props) => props.questionId,
    loadingAndErrorWrapper: false,
  }),
)(SavedQuestionLoader);
