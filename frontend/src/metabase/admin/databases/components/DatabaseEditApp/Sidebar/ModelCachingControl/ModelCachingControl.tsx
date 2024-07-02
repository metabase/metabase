import { useState } from "react";
import { t, jt } from "ttag";

import {
  PERSIST_DATABASE,
  UNPERSIST_DATABASE,
} from "metabase/admin/databases/database";
import ActionButton from "metabase/components/ActionButton";
import TippyPopover from "metabase/components/Popover/TippyPopover";
import ExternalLink from "metabase/core/components/ExternalLink";
import ButtonsS from "metabase/css/components/buttons.module.css";
import { useDispatch } from "metabase/lib/redux";
import MetabaseSettings from "metabase/lib/settings";
import { MetabaseApi } from "metabase/services";
import type Database from "metabase-lib/v1/metadata/Database";
import { getModelCacheSchemaName } from "metabase-lib/v1/metadata/utils/models";

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
      href={MetabaseSettings.docsUrl("data-modeling/model-persistence")}
    >{t`Learn more.`}</ExternalLink>
  );
  return (
    <PopoverContent>
      <FeatureTitle>{t`Persist models`}</FeatureTitle>
      <FeatureDescriptionText>{jt`We'll create tables with model data and refresh them on a schedule you define. To enable model persistence, you need to grant this connection's credentials read and write permissions on the "${schemaName}" schema or grant create schema permissions. ${docsLink}`}</FeatureDescriptionText>
    </PopoverContent>
  );
}

function isLackPermissionsError(response: ErrorResponse) {
  return response?.data?.message?.startsWith("Lack permissions");
}

function ModelCachingControl({ database }: Props) {
  const [error, setError] = useState<string | null>(null);
  const dispatch = useDispatch();

  const databaseId = database.id;
  const isEnabled = database.isPersisted();

  const normalText = isEnabled
    ? t`Turn model persistence off`
    : t`Turn model persistence on`;

  const siteUUID = MetabaseSettings.get("site-uuid") || "";
  const cacheSchemaName = getModelCacheSchemaName(databaseId, siteUUID);

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

  return (
    <div>
      <ControlContainer>
        <ActionButton
          className={ButtonsS.Button}
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
