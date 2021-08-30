import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import _ from "underscore";

import Recents from "metabase/entities/recents";
import Card from "metabase/components/Card";
import Text from "metabase/components/type/Text";
import * as Urls from "metabase/lib/urls";
import {
  ResultLink,
  Title,
} from "metabase/search/components/SearchResult.styled";
import { ItemIcon } from "metabase/search/components/SearchResult";
import EmptyState from "metabase/components/EmptyState";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import { getTranslatedEntityName } from "./utils";
import {
  EmptyStateContainer,
  Header,
  RecentListItemContent,
} from "./RecentsList.styled";

const LOADER_THRESHOLD = 100;

const getItemKey = ({ model, model_id }) => `${model}:${model_id}`;
const getItemName = model_object =>
  model_object.display_name || model_object.name;

const propTypes = {
  list: PropTypes.arrayOf(
    PropTypes.shape({
      model_id: PropTypes.number,
      model: PropTypes.string,
      model_object: PropTypes.object,
    }),
  ),
  loading: PropTypes.bool,
};

function RecentsList({ list, loading }) {
  const [canShowLoader, setCanShowLoader] = useState(false);
  const hasRecents = list?.length > 0;

  useEffect(() => {
    const timer = setTimeout(() => setCanShowLoader(true), LOADER_THRESHOLD);
    return () => clearTimeout(timer);
  }, []);

  if (loading && !canShowLoader) {
    return null;
  }

  return (
    <Card py={1}>
      <Header>{t`Recently viewed`}</Header>
      <LoadingAndErrorWrapper loading={loading} noWrapper>
        <React.Fragment>
          {hasRecents && (
            <ul>
              {list.map(item => (
                <li key={getItemKey(item)}>
                  <ResultLink to={Urls.modelToUrl(item)} compact={true}>
                    <RecentListItemContent
                      align="start"
                      data-testid="recently-viewed-item"
                    >
                      <ItemIcon item={item} type={item.model} />
                      <div>
                        <Title data-testid="recently-viewed-item-title">
                          {getItemName(item.model_object)}
                        </Title>
                        <Text data-testid="recently-viewed-item-type">
                          {getTranslatedEntityName(item.model)}
                        </Text>
                      </div>
                    </RecentListItemContent>
                  </ResultLink>
                </li>
              ))}
            </ul>
          )}

          {!hasRecents && (
            <EmptyStateContainer>
              <EmptyState message={t`Nothing here`} icon="all" />
            </EmptyStateContainer>
          )}
        </React.Fragment>
      </LoadingAndErrorWrapper>
    </Card>
  );
}

RecentsList.propTypes = propTypes;

export default _.compose(
  Recents.loadList({
    wrapped: true,
    reload: true,
    loadingAndErrorWrapper: false,
  }),
)(RecentsList);
