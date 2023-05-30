import React, { useState } from "react";
import { t, jt } from "ttag";

import { ExternalLink } from "metabase/core/components/ExternalLink";
import ActionButton from "metabase/components/ActionButton";
import TippyPopover from "metabase/components/Popover/TippyPopover";

import { MetabaseApi } from "metabase/services";

import MetabaseSettings from "metabase/lib/settings";
import Database from "metabase-lib/metadata/Database";
import { getModelCacheSchemaName } from "metabase-lib/metadata/utils/models";

import {
  ControlContainer,
  HoverableIcon,
  PopoverContent,
  FeatureTitle,
  FeatureDescriptionText,
  ErrorMessage,
} from "./ModelCachingControl.styled";

interface Props {
  database: Database;
}

interface ErrorResponse {
  data?: {
    message?: string;
  };
}

function FeatureDescription({ schemaName }: { schemaName: string }) {
  const docsLink = (
    <ExternalLink
      key="model-caching-link"
      href={MetabaseSettings.docsUrl("data-modeling/models")}
    >{t`Learn more.`}</ExternalLink>
  );
  return (
    <PopoverContent>
      <FeatureTitle>{t`Cache models`}</FeatureTitle>
      <FeatureDescriptionText>{jt`We'll create tables with model data and refresh them on a schedule you define. To enable it, you need to grant this connection credential read and write permissions on the "${schemaName}" schema or grant create schema permissions. ${docsLink}`}</FeatureDescriptionText>
    </PopoverContent>
  );
}

function isLackPermissionsError(response: ErrorResponse) {
  return response?.data?.message?.startsWith("Lack permissions");
}

function ModelCachingControl({ database }: Props) {
  const [error, setError] = useState<string | null>(null);

  const databaseId = database.id;
  const isEnabled = database.isPersisted();

  const normalText = isEnabled
    ? t`Turn model caching off`
    : t`Turn model caching on`;

  const siteUUID = MetabaseSettings.get("site-uuid") || "";
  const cacheSchemaName = getModelCacheSchemaName(databaseId, siteUUID);

  const handleCachingChange = async () => {
    setError(null);
    try {
      if (isEnabled) {
        await MetabaseApi.db_unpersist({ dbId: databaseId });
      } else {
        await MetabaseApi.db_persist({ dbId: databaseId });
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

  return (
    <div>
      <ControlContainer>
        <ActionButton
          className="Button"
          normalText={normalText}
          failedText={t`Failed`}
          successText={t`Done`}
          actionFn={handleCachingChange}
        />
        <TippyPopover
          placement="right-end"
          content={<FeatureDescription schemaName={cacheSchemaName} />}
        >
          <HoverableIcon name="info" />
        </TippyPopover>
      </ControlContainer>
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </div>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ModelCachingControl;
