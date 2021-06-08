import React from "react";
import { t } from "ttag";
import { Box, Flex } from "grid-styled";
import Recents from "metabase/entities/recents";

import Card from "metabase/components/Card";
import Text from "metabase/components/type/Text";

import * as Urls from "metabase/lib/urls";
import { capitalize } from "metabase/lib/formatting";

import {
  ResultLink,
  Title,
} from "metabase/search/components/SearchResult.styled";

import { ItemIcon } from "metabase/search/components/SearchResult";

export default function RecentsList() {
  return (
    <Recents.ListLoader wrapped reload>
      {({ list }) => (
        <Card py={1}>
          <Box px={2} py={1}>
            <h4>{t`Recently viewed`}</h4>
          </Box>
          <ol>
            {list.map(l => (
              <div key={`${l.model}:${l.model_id}`}>
                <ResultLink to={Urls.modelToUrl(l)} compact={true}>
                  <Flex align="start">
                    <ItemIcon item={l} type={l.model} />
                    <Box>
                      <Title>{l.model_object.name}</Title>
                      <Text>{capitalize(l.model === "card" ? `question` : l.model)}</Text>
                    </Box>
                  </Flex>
                </ResultLink>
              </div>
            ))}
          </ol>
        </Card>
      )}
    </Recents.ListLoader>
  );
}
