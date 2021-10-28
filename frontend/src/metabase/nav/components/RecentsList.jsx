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
  RecentListItemSpinner,
} from "./RecentsList.styled";

const LOADER_THRESHOLD = 100;

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
              {list.map(item => {
                const key = getItemKey(item);
                const url = Urls.modelToUrl(item);
                const title = getItemName(item);
                const type = getTranslatedEntityName(item.model);
                const loading = isItemLoading(item);
                const disabled = isItemDisabled(item);

                return (
                  <li key={key}>
                    <ResultLink to={url} compact={true} active={!disabled}>
                      <RecentListItemContent
                        align="start"
                        data-testid="recently-viewed-item"
                      >
                        <ItemIcon
                          item={item}
                          type={item.model}
                          disabled={disabled}
                        />
                        <div>
                          <Title
                            disabled={disabled}
                            data-testid="recently-viewed-item-title"
                          >
                            {title}
                          </Title>
                          <Text data-testid="recently-viewed-item-type">
                            {type}
                          </Text>
                        </div>
                        {loading && (
                          <RecentListItemSpinner size={24} borderWidth={3} />
                        )}
                      </RecentListItemContent>
                    </ResultLink>
                  </li>
                );
              })}
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

const getItemKey = ({ model, model_id }) => {
  return `${model}:${model_id}`;
};

const getItemName = ({ model_object }) => {
  return model_object.display_name || model_object.name;
};

const isItemLoading = ({ model, model_object }) => {
  switch (model) {
    case "database":
    case "table":
      return !model_object.active;
    default:
      return false;
  }
};

const isItemDisabled = ({ model, model_object }) => {
  switch (model) {
    case "table":
      return !model_object.active;
    default:
      return false;
  }
};

export default _.compose(
  Recents.loadList({
    wrapped: true,
    reload: true,
    loadingAndErrorWrapper: false,
  }),
)(RecentsList);
