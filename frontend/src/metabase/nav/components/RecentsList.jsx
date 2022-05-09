import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import _ from "underscore";

import RecentItems from "metabase/entities/recent-items";
import Text from "metabase/components/type/Text";
import * as Urls from "metabase/lib/urls";
import { isSyncCompleted } from "metabase/lib/syncing";
import { PLUGIN_MODERATION } from "metabase/plugins";
import {
  ResultLink,
  ResultSpinner,
  Title,
  TitleWrapper,
} from "metabase/search/components/SearchResult.styled";
import { ItemIcon } from "metabase/search/components/SearchResult";
import EmptyState from "metabase/components/EmptyState";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import { getTranslatedEntityName } from "../utils";
import {
  Root,
  EmptyStateContainer,
  Header,
  RecentListItemContent,
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
    <Root>
      <Header>{t`Recently viewed`}</Header>
      <LoadingAndErrorWrapper loading={loading} noWrapper>
        <React.Fragment>
          {hasRecents && (
            <ul>
              {list.map(item => {
                const key = getItemKey(item);
                const title = getItemName(item);
                const type = getTranslatedEntityName(item.model);
                const active = isItemActive(item);
                const loading = isItemLoading(item);
                const url = active ? Urls.modelToUrl(item) : "";
                const moderatedStatus = getModeratedStatus(item);

                return (
                  <li key={key}>
                    <ResultLink to={url} compact={true} active={active}>
                      <RecentListItemContent
                        align="start"
                        data-testid="recently-viewed-item"
                      >
                        <ItemIcon
                          item={item}
                          type={item.model}
                          active={active}
                        />
                        <div>
                          <TitleWrapper>
                            <Title
                              active={active}
                              data-testid="recently-viewed-item-title"
                            >
                              {title}
                            </Title>
                            <PLUGIN_MODERATION.ModerationStatusIcon
                              status={moderatedStatus}
                              size={12}
                            />
                          </TitleWrapper>
                          <Text data-testid="recently-viewed-item-type">
                            {type}
                          </Text>
                        </div>
                        {loading && <ResultSpinner size={24} borderWidth={3} />}
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
    </Root>
  );
}

RecentsList.propTypes = propTypes;

const getItemKey = ({ model, model_id }) => {
  return `${model}:${model_id}`;
};

const getItemName = ({ model_object }) => {
  return model_object.display_name || model_object.name;
};

const getModeratedStatus = ({ model_object }) => {
  return model_object.moderated_status;
};

const isItemActive = ({ model, model_object }) => {
  switch (model) {
    case "table":
      return isSyncCompleted(model_object);
    default:
      return true;
  }
};

const isItemLoading = ({ model, model_object }) => {
  switch (model) {
    case "database":
    case "table":
      return !isSyncCompleted(model_object);
    default:
      return false;
  }
};

export default _.compose(
  RecentItems.loadList({
    wrapped: true,
    reload: true,
    loadingAndErrorWrapper: false,
  }),
)(RecentsList);
