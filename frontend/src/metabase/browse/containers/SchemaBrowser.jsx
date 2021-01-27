import React from "react";
import { Box, Flex } from "grid-styled";
import { t } from "ttag";

import Schema from "metabase/entities/schemas";

import EntityItem from "metabase/components/EntityItem";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";
import Tooltip from "metabase/components/Tooltip";

import TableBrowser from "metabase/browse/containers/TableBrowser";
import { color } from "metabase/lib/colors";

import { ANALYTICS_CONTEXT } from "metabase/browse/constants";

function SchemaBrowser(props) {
  const { children, schemas, params } = props;
  const { dbId } = params;
  return (
    <Flex w={"100%"} bg="white">
      <Box>
        {schemas.length === 1 ? (
          <TableBrowser
            {...props}
            params={{ ...props.params, schemaName: schemas[0].name }}
            // hide the schema since there's only one
            showSchemaInHeader={false}
          />
        ) : (
          <Box>
            {schemas.length === 0 ? (
              <h2 className="full text-centered text-medium">{t`This database doesn't have any tables.`}</h2>
            ) : (
              schemas.map(schema => (
                <Link
                  key={schema.id}
                  to={`/browse/${dbId}/schema/${schema.name}`}
                  mb={1}
                  hover={{ color: color("accent2") }}
                  data-metabase-event={`${ANALYTICS_CONTEXT};Schema Click`}
                  className="overflow-hidden"
                >
                  <Flex align="center">
                    <EntityItem
                      name={schema.name}
                      iconName="folder"
                      iconColor={color("accent2")}
                      item={schema}
                    />
                    <Box ml="auto">
                      <Icon name="reference" />
                      <Tooltip tooltip={t`X-ray this schema`}>
                        <Icon name="bolt" mx={1} />
                      </Tooltip>
                    </Box>
                  </Flex>
                </Link>
              ))
            )}
          </Box>
        )}
      </Box>
      {children}
    </Flex>
  );
}

export default Schema.loadList({
  query: (state, { params: { dbId } }) => ({ dbId }),
})(SchemaBrowser);
