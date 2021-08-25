import React from "react";
import { t } from "ttag";
import Recents from "metabase/entities/recents";

import Card from "metabase/components/Card";
import Text from "metabase/components/type/Text";

import * as Urls from "metabase/lib/urls";

import {
  ResultLink,
  Title,
} from "metabase/search/components/SearchResult.styled";
import { ItemIcon } from "metabase/search/components/SearchResult";
import { getTranslatedEntityName } from "./utils";
import EmptyState from "metabase/components/EmptyState";
import {
  EmptyStateContainer,
  Header,
  RecentListItemContent,
} from "./RecentsList.styled";

const getItemKey = ({ model, model_id }) => `${model}:${model_id}`;
const getItemName = model_object =>
  model_object.display_name || model_object.name;

export default function RecentsList() {
  return (
    <Card py={1}>
      <Header>{t`Recently viewed`}</Header>
      <Recents.ListLoader wrapped reload>
        {({ list }) => {
          const hasRecents = list.length > 0;

          if (!hasRecents) {
            return (
              <EmptyStateContainer>
                <EmptyState message={t`Nothing here`} icon="all" />
              </EmptyStateContainer>
            );
          }

          return (
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
          );
        }}
      </Recents.ListLoader>
    </Card>
  );
}
