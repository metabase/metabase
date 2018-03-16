/* @flow */
import React from "react";
import { connect } from "react-redux";

// things that will eventually load the quetsion
import { deserializeCardFromUrl } from "metabase/lib/card";
import { loadMetadataForCard } from "metabase/query_builder/actions";
import { getMetadata } from "metabase/selectors/metadata";

import Question from "metabase-lib/lib/Question";

// type annotations
import type Metadata from "metabase-lib/lib/metadata/Metadata";

/*
 * AdHocQuestionLoader
 *
 * Load a transient quetsion via its encoded URL and return it to the calling
 * component
 *
 * @example
 *
 * Render prop style
 * import AdHocQuestionLoader from 'metabase/containers/AdHocQuestionLoader'
 *
 * // assuming
 * class ExampleAdHocQuestionFeature extends React.Component {
 *    render () {
 *      return (
 *        <AdHocQuestionLoader questionId={this.props.params.questionId}>
 *        { (question) => {
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

type Props = {
  children: Function,
  loadMetadataForCard: Function,
  metadata: Metadata,
  questionHash: string,
};

type State = {
  // the question should be of type Question if it is set
  question: ?Question,
};

export class AdHocQuestionLoader extends React.Component {
  props: Props;

  state: State = {
    // this will store the loaded question
    question: null,
  };

  componentWillMount() {
    // load the specified question when the component mounts
    this._loadQuestion(this.props.questionHash);
  }

  componentWillReceiveProps(nextProps: Props) {
    // if the questionHash changes (this will most likely be the result of a
    // url change) then we need to load this new question
    if (nextProps.questionHash !== this.props.questionHash) {
      this._loadQuestion(nextProps.questionHash);
    }
  }

  /*
   * Load an AdHoc question and any required metadata
   *
   * 1. Decode the question via the URL
   * 2. Load any required metadata into the redux store
   * 3. Create a new Question object to return to metabase-lib methods can
   *    be used
   * 4. Set the component state to the new Question
   */
  async _loadQuestion(questionHash: string) {
    const card = deserializeCardFromUrl(questionHash);
    // pass the decoded card to load any necessary metadata
    // (tables, source db, segments, etc) into
    // the redux store, the resulting metadata will be avaliable as metadata on the
    // component props once it's avaliable
    await this.props.loadMetadataForCard(card);

    // instantiate a new question object using the metadata and saved question
    // so we can use metabase-lib methods to retrieve information and modify
    // the question
    const question = new Question(this.props.metadata, card);

    // finally, set state to store the Question object so it can be passed
    // to the component using the loader
    this.setState({ question });
  }

  render() {
    // call the child function with our loaded question
    return this.props.children(this.state.question);
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

export default connect(mapStateToProps, mapDispatchToProps)(
  AdHocQuestionLoader,
);
