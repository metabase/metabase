/* eslint-disable react/prop-types */
import { useMemo } from "react";
import { useAsync } from "react-use";
import _ from "underscore";

import { Questions } from "metabase/entities/questions";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { loadMetadataForCard } from "metabase/questions/actions";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/v1/Question";

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
const SavedQuestionLoaderInner = ({
  children,
  question: loadedQuestion,
  error,
  loading,
}) => {
  const metadata = useSelector(getMetadata);
  const dispatch = useDispatch();

  const cardMetadataState = useAsync(async () => {
    if (loadedQuestion?.id() == null) {
      return;
    }

    await dispatch(loadMetadataForCard(loadedQuestion.card()));
  }, [loadedQuestion?.id()]);

  const question = useMemo(() => {
    const hasCardMetadataLoaded =
      !cardMetadataState.loading && cardMetadataState.error == null;

    if (!loadedQuestion || !hasCardMetadataLoaded) {
      return null;
    }

    return new Question(loadedQuestion.card(), metadata);
  }, [cardMetadataState, loadedQuestion, metadata]);

  return (
    children?.({
      question,
      loading: loading || cardMetadataState.loading,
      error: error ?? cardMetadataState.error,
    }) ?? null
  );
};

export const SavedQuestionLoader = _.compose(
  Questions.load({
    id: (_state, props) => props.questionId,
    loadingAndErrorWrapper: false,
  }),
)(SavedQuestionLoaderInner);
