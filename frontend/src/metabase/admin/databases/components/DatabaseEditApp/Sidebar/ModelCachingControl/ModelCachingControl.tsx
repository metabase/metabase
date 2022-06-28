import React from "react";
import { t, jt } from "ttag";

import ExternalLink from "metabase/core/components/ExternalLink";
import ActionButton from "metabase/components/ActionButton";
import TippyPopover from "metabase/components/Popover/TippyPopover";

import { getModelCacheSchemaName } from "metabase/lib/data-modeling/utils";
import MetabaseSettings from "metabase/lib/settings";

import {
  ControlContainer,
  HoverableIcon,
  PopoverContent,
  FeatureTitle,
  FeatureDescriptionText,
} from "./ModelCachingControl.styled";

interface Props {
  databaseId: number;
  isEnabled: boolean;
  onToggle: (isEnabled: boolean) => Promise<void>;
}

function FeatureDescription({ schemaName }: { schemaName: string }) {
  const docsLink = (
    <ExternalLink
      key="model-caching-link"
      href={MetabaseSettings.docsUrl("users-guide/models")}
    >{t`Learn more.`}</ExternalLink>
  );
  return (
    <PopoverContent>
      <FeatureTitle>{t`Cache models`}</FeatureTitle>
      <FeatureDescriptionText>{jt`We'll create tables with model data and refresh them on a schedule you define. To enable it, you need to grant this connection credential read and write permissions on the "${schemaName}" schema or grant create schema permissions. ${docsLink}`}</FeatureDescriptionText>
    </PopoverContent>
  );
}

function ModelCachingControl({ databaseId, isEnabled, onToggle }: Props) {
  const normalText = isEnabled
    ? t`Turn model caching off`
    : t`Turn model caching on`;
  const cacheSchemaName = getModelCacheSchemaName(databaseId);
  return (
    <ControlContainer>
      <ActionButton
        className="Button"
        normalText={normalText}
        failedText={t`Failed`}
        successText={t`Done`}
        actionFn={() => onToggle(!isEnabled)}
      />
      <TippyPopover
        placement="right-end"
        content={<FeatureDescription schemaName={cacheSchemaName} />}
      >
        <HoverableIcon name="info" />
      </TippyPopover>
    </ControlContainer>
  );
}

export default ModelCachingControl;
