import React, { Component } from "react";
import { connect } from "react-redux";
import { Link } from "react-router";
import { t } from "c-3po";
import Icon from "metabase/components/Icon";
import Button from "metabase/components/Button";

import { Box, Flex, Heading } from "rebass";

import CollectionActions from "../components/CollectionActions";
import CollectionButtons from "../components/CollectionButtons";

import { search } from "../questions";
import { loadCollections } from "../collections";
import {
  getLoadingInitialEntities,
  getAllCollections,
  getAllEntities,
} from "../selectors";
import { getUserIsAdmin } from "metabase/selectors/user";

import RecentViews from "metabase/home/components/RecentViews";

import { replace, push } from "react-router-redux";
import EmptyState from "metabase/components/EmptyState";

export const CollectionEmptyState = () => (
  <div className="flex flex-column sm-flex-row align-center p2 mt4 bordered border-med border-brand rounded bg-grey-0 text-brand">
    <Icon
      name="collection"
      size={32}
      className="mb2 sm-mr2 sm-mb0 hide sm-show"
    />
    <div className="flex-full text-centered sm-text-left">
      <h3>{t`Create collections for your saved questions`}</h3>
      <div className="mt1">
        {t`Collections help you organize your questions and allow you to decide who gets to see what.`}{" "}
        <a
          href="http://www.metabase.com/docs/latest/administration-guide/06-collections.html"
          target="_blank"
        >
          {t`Learn more`}
        </a>
      </div>
    </div>
    <Link to="/collections/create" className="mt2 sm-mt0">
      <Button primary>{t`Create a collection`}</Button>
    </Link>
  </div>
);

const CollectionEntityNav = () => (
  <Flex>
    <Flex align="center" justify="center">
      <Link to="/dashboards">
        <Icon name="dashboard" />
        Dashboards
      </Link>
    </Flex>
    <Flex align="center" justify="center">
      <Link to="/metrics">
        <Icon name="insight" />
        Metrics
      </Link>
    </Flex>
    <Flex align="center" justify="center">
      <Link to="/segments">
        <Icon name="dashboard" />
        Segments
      </Link>
    </Flex>
    <Flex align="center" justify="center">
      <Link to="/segments">
        <Icon name="dashboard" />
        Questions
      </Link>
    </Flex>
  </Flex>
);

export const NoSavedQuestionsState = () => (
  <div className="flex-full flex align-center justify-center mb4">
    <EmptyState
      message={
        <span
        >{t`Explore your data, create charts or maps, and save what you find.`}</span>
      }
      image="/app/img/questions_illustration"
      action={t`Ask a question`}
      link="/question"
    />
  </div>
);

export const QuestionIndexHeader = ({
  questions,
  collections,
  isAdmin,
  onSearch,
}) => {
  // Some replication of logic for making writing tests easier
  const hasCollections = collections && collections.length > 0;

  const showSetPermissionsLink = isAdmin && hasCollections;

  return (
    <div className="flex align-center pt4 pb2">
      <div className="flex align-center ml-auto">
        <CollectionActions>
          {showSetPermissionsLink && (
            <Link to="/collections/permissions">
              <Icon
                size={18}
                name="lock"
                tooltip={t`Set permissions for collections`}
              />
            </Link>
          )}
          <Link to="/questions/archive">
            <Icon size={20} name="viewArchive" tooltip={t`View the archive`} />
          </Link>
        </CollectionActions>
      </div>
    </div>
  );
};

const mapStateToProps = (state, props) => ({
  loading: getLoadingInitialEntities(state, props),
  questions: getAllEntities(state, props),
  collections: getAllCollections(state, props),
  isAdmin: getUserIsAdmin(state, props),
});

const mapDispatchToProps = {
  search,
  loadCollections,
  replace,
  push,
};

/* connect() is in the end of this file because of the plain QuestionIndex component is used in Jest tests */
export class QuestionIndex extends Component {
  componentWillMount() {
    this.props.loadCollections();
  }

  render() {
    const { loading, questions, collections, push, isAdmin } = this.props;

    const hasCollections = collections && collections.length > 0;

    return (
      <Box>
        <Heading>Metabase</Heading>
        {!loading && (
          <QuestionIndexHeader
            questions={questions}
            collections={collections}
            isAdmin={isAdmin}
            onSearch={this.props.search}
          />
        )}

        <Flex>
          {hasCollections && (
            <CollectionButtons
              collections={collections}
              isAdmin={isAdmin}
              push={push}
            />
          )}
          <Box w={2 / 3}>
            <CollectionEntityNav />
            <RecentViews />
            {/* EntityList loads `questions` according to the query specified in the url query string */}
            {/*
              <EntityList
                entityType="cards"
                entityQuery={{ f: "all", collection: "", ...location.query }}
                // use replace when changing sections so back button still takes you back to collections page
                onChangeSection={section =>
                  replace({
                    ...location,
                    query: { ...location.query, f: section },
                  })
                }
              />
              */}
          </Box>
        </Flex>
      </Box>
    );
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(QuestionIndex);
