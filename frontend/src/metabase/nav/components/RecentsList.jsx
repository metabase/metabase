import React from "react";
import { t } from "ttag";
import { Box, Flex } from "grid-styled";
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

const getItemKey = ({ model, model_id }) => `${model}:${model_id}`;

export default function RecentsList() {
  return (
    <Card py={1}>
      <Box px={2} py={1}>
        <h4>{t`Recently viewed`}</h4>
      </Box>
      <Recents.ListLoader wrapped reload>
        {({ list }) => {
          const hasRecents = list.length > 0;

          if (!hasRecents) {
            return (
              <Box my={3}>
                <EmptyState message={t`Nothing here`} icon="all" />
              </Box>
            );
          }

          return (
            <ul>
              {list.map(item => (
                <div key={getItemKey(item)}>
                  <ResultLink to={Urls.modelToUrl(item)} compact={true}>
                    <Flex align="start" data-testid="recently-viewed-item">
                      <ItemIcon item={item} type={item.model} />
                      <Box>
                        <Title data-testid="recently-viewed-item-title">
                          {item.model_object.name}
                        </Title>
                        <Text data-testid="recently-viewed-item-type">
                          {getTranslatedEntityName(item.model)}
                        </Text>
                      </Box>
                    </Flex>
                  </ResultLink>
                </div>
              ))}
            </ul>
          );
        }}
      </Recents.ListLoader>
    </Card>
  );
}
