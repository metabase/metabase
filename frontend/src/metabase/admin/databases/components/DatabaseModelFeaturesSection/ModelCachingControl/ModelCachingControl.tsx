import { useState } from "react";
import { jt, t } from "ttag";

import {
  PERSIST_DATABASE,
  UNPERSIST_DATABASE,
} from "metabase/admin/databases/database";
import { useDocsUrl, useSetting } from "metabase/common/hooks";
import ExternalLink from "metabase/core/components/ExternalLink";
import Toggle from "metabase/core/components/Toggle";
import { useDispatch } from "metabase/lib/redux";
import { MetabaseApi } from "metabase/services";
import { Box, Flex } from "metabase/ui";
import type Database from "metabase-lib/v1/metadata/Database";
import { getModelCacheSchemaName } from "metabase-lib/v1/metadata/utils/models";

import { Description, Error, Label } from "../ModelFeatureToggles";

interface Props {
  database: Database;
}

interface ErrorResponse {
  data?: {
    message?: string;
  };
}

function isLackPermissionsError(response: ErrorResponse) {
  return response?.data?.message?.startsWith("Lack permissions");
}

export function ModelCachingControl({ database }: Props) {
  const [error, setError] = useState<string | null>(null);
  const dispatch = useDispatch();

  const databaseId = database.id;
  const isEnabled = database.isPersisted();

  const siteUUID = useSetting("site-uuid");
  const cacheSchemaName = getModelCacheSchemaName(databaseId, siteUUID || "");

  const handleCachingChange = async () => {
    setError(null);
    try {
      if (isEnabled) {
        await MetabaseApi.db_unpersist({ dbId: databaseId });
        await dispatch({ type: UNPERSIST_DATABASE });
      } else {
        await MetabaseApi.db_persist({ dbId: databaseId });
        await dispatch({ type: PERSIST_DATABASE });
      }
    } catch (error) {
      const response = error as ErrorResponse;
      if (isLackPermissionsError(response)) {
        setError(
          t`For models to be cached, the user should have create table permission or create schema permission in this database.`,
        );
      } else {
        setError(response.data?.message || t`An error occurred`);
      }
      throw error;
    }
  };

  const { url: docsUrl } = useDocsUrl("data-modeling/model-persistence");

  return (
    <div>
      <Flex align="center" justify="space-between" mb="xs">
        <Label htmlFor="model-persistence-toggle">{t`Model persistence`}</Label>
        <Toggle
          id="model-persistence-toggle"
          value={isEnabled}
          onChange={handleCachingChange}
        />
      </Flex>
      <Box maw="22.5rem">
        {error ? <Error>{error}</Error> : null}
        <Description>
          {jt`We'll create tables with model data and refresh them on a schedule you define. To enable model persistence, you need to grant this connection's credentials read and write permissions on the "${cacheSchemaName}" schema or grant create schema permissions. ${(
            <ExternalLink
              key="model-caching-link"
              href={docsUrl}
            >{t`Learn more.`}</ExternalLink>
          )}`}
        </Description>
      </Box>
    </div>
  );
}
