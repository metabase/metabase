/* @flow */

import React from "react";
import { connect } from "react-redux";

// things that will eventually load the quetsion
import { CardApi } from "metabase/services";
import { loadMetadataForCard } from "metabase/query_builder/actions";
import { getMetadata } from "metabase/selectors/metadata";

import Question from "metabase-lib/lib/Question";

// type annotations
import type Metadata from "metabase-lib/lib/metadata/Metadata";
import type { Card } from "metabase-types/types/Card";

type ChildProps = {
  loading: boolean,
  error: ?any,
  question: ?Question,
};

type Props = {
  questionId: ?number,
  children?: (props: ChildProps) => React$Element<any>,
  // provided by redux
  loadMetadataForCard: (card: Card) => Promise<void>,
  metadata: Metadata,
};

type State = {
  // the question should be of type Question if it is set
  question: ?Question,
  // keep a reference to the card as well to help with re-creating question
  // objects if the underlying metadata changes
  card: ?Card,
  loading: boolean,
  error: ?any,
};

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
export class SavedQuestionLoader extends React.Component {
  props: Props;

  state: State = {
    // this will store the loaded question
    question: null,
    card: null,
    loading: false,
    error: null,
  };

  componentWillMount() {
    // load the specified question when the component mounts
    this._loadQuestion(this.props.questionId);
  }

  componentWillReceiveProps(nextProps: Props) {
    // if the questionId changes (this will most likely be the result of a
    // url change) then we need to load this new question
    if (nextProps.questionId !== this.props.questionId) {
      this._loadQuestion(nextProps.questionId);
    }

    // if the metadata changes for some reason we need to make sure we
    // update the question with that metadata
    if (nextProps.metadata !== this.props.metadata && this.state.card) {
      this.setState({
        question: new Question(this.state.card, nextProps.metadata),
      });
    }
  }

  /*
   * Load a saved question and any required metadata
   *
   * 1. Get the card from the api
   * 2. Load any required metadata into the redux store
   * 3. Create a new Question object to return to metabase-lib methods can
   *    be used
   * 4. Set the component state to the new Question
   */
  async _loadQuestion(questionId: ?number) {
    if (questionId == null) {
      this.setState({
        loading: false,
        error: null,
        question: null,
        card: null,
      });
      return;
    }
    try {
      this.setState({ loading: true, error: null });
      // get the saved question via the card API
      const card = await CardApi.get({ cardId: questionId });

      // pass the retrieved card to load any necessary metadata
      // (tables, source db, segments, etc) into
      // the redux store, the resulting metadata will be avaliable as metadata on the
      // component props once it's avaliable
      await this.props.loadMetadataForCard(card);

      // instantiate a new question object using the metadata and saved question
      // so we can use metabase-lib methods to retrieve information and modify
      // the question
      //
      const question = new Question(card, this.props.metadata);

      // finally, set state to store the Question object so it can be passed
      // to the component using the loader, keep a reference to the card
      // as well
      this.setState({ loading: false, question, card });
    } catch (error) {
      this.setState({ loading: false, error });
    }
  }

  render() {
    const { children } = this.props;
    const { question, loading, error } = this.state;
    // call the child function with our loaded question
    return children && children({ question, loading, error });
  }
}

// redux stuff
function mapStateToProps(state) {
  return {
    metadata: getMetadata(state),
  };
}

const mapDispatchToProps = {
  loadMetadataForCard,
};

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(SavedQuestionLoader);
