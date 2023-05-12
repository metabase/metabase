import _ from "underscore";
import { useAsync } from "react-use";

import { useDispatch } from "metabase/lib/redux";
import { loadMetadataForCard } from "metabase/questions/actions";

import Questions from "metabase/entities/questions";

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
const SavedQuestionLoader = ({ children, question, error, loading }) => {
  const dispatch = useDispatch();

  const metadataState = useAsync(async () => {
    if (question) {
      await dispatch(loadMetadataForCard(question.card()));
    }
  }, [question.id()]);

  const isMetadataLoaded =
    !metadataState.loading && metadataState.error == null;

  return (
    children?.({
      question: isMetadataLoaded ? question : null,
      loading: loading || isMetadataLoaded.loading,
      error: error ?? isMetadataLoaded.error,
    }) ?? null
  );
};

export default _.compose(
  Questions.load({
    id: (_state, props) => props.questionId,
    loadingAndErrorWrapper: false,
  }),
)(SavedQuestionLoader);
