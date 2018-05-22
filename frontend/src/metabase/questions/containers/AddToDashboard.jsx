import React, { Component } from "react";
import { t } from "c-3po";
import ModalContent from "metabase/components/ModalContent.jsx";
import Icon from "metabase/components/Icon.jsx";
import HeaderWithBack from "metabase/components/HeaderWithBack";
import QuestionIcon from "metabase/components/QuestionIcon";

import CollectionListLoader from "metabase/containers/CollectionListLoader";
import QuestionListLoader from "metabase/containers/QuestionListLoader";

import ExpandingSearchField from "../components/ExpandingSearchField.jsx";

const QuestionRow = ({ question, onClick }) => (
  <div className="py2 border-top border-grey-1">
    <div className="flex flex-full align-center">
      <QuestionIcon
        question={question}
        className="text-light-blue mr2"
        size={20}
      />
      <div onClick={onClick}>
        <div className="h3 mb1 text-slate text-brand-hover cursor-pointer">
          {question.name}
        </div>
        {question.description ? (
          <div className="text-slate">{question.description}</div>
        ) : (
          <div className="text-light-blue">{`No description yet`}</div>
        )}
      </div>
    </div>
  </div>
);

export default class AddToDashboard extends Component {
  state = {
    collection: null,
    query: null,
  };

  renderQuestionList = () => {
    return (
      <QuestionListLoader entityQuery={this.state.query}>
        {({ questions }) => (
          <div>
            {questions.map(question => (
              <QuestionRow
                question={question}
                onClick={() => this.props.onAdd(question)}
              />
            ))}
          </div>
        )}
      </QuestionListLoader>
    );
  };

  renderCollections = () => {
    return (
      <CollectionListLoader>
        {({ collections }) => (
          <div>
            {/* only show the collections list if there are actually collections fixes #4668 */
            collections.length > 0 ? (
              <ol>
                {collections.map((collection, index) => (
                  <li
                    className="text-brand-hover flex align-center border-bottom cursor-pointer py1 md-py2"
                    key={index}
                    onClick={() =>
                      this.setState({
                        collection: collection,
                        query: { collection: collection.slug },
                      })
                    }
                  >
                    <Icon
                      className="mr2"
                      name="all"
                      style={{ color: collection.color }}
                    />
                    <h3>{collection.name}</h3>
                    <Icon className="ml-auto" name="chevronright" />
                  </li>
                ))}
                <li
                  className="text-brand-hover flex align-center border-bottom cursor-pointer py1 md-py2"
                  onClick={() =>
                    this.setState({
                      collection: { name: t`Everything else` },
                      query: { collection: "" },
                    })
                  }
                >
                  <Icon className="mr2" name="everything" />
                  <h3>Everything else</h3>
                  <Icon className="ml-auto" name="chevronright" />
                </li>
              </ol>
            ) : (
              this.renderQuestionList()
            )}
          </div>
        )}
      </CollectionListLoader>
    );
  };

  render() {
    const { query, collection } = this.state;
    return (
      <div className="wrapper wrapper--trim">
        <ModalContent
          title={t`Pick a question to add`}
          className="mb4 scroll-y"
          onClose={() => this.props.onClose()}
        >
          <div className="py1">
            <div className="flex align-center ml3 mb3">
              {!query ? (
                <ExpandingSearchField
                  defaultValue={query && query.q}
                  onSearch={value =>
                    this.setState({
                      collection: null,
                      query: { q: value },
                    })
                  }
                />
              ) : (
                <HeaderWithBack
                  name={collection && collection.name}
                  onBack={() =>
                    this.setState({ collection: null, query: null })
                  }
                />
              )}
            </div>
          </div>
          <div className="mx4">
            {query
              ? // a search term has been entered so show the questions list
                this.renderQuestionList()
              : // show the collections list
                this.renderCollections()}
          </div>
        </ModalContent>
      </div>
    );
  }
}
