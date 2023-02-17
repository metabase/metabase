import React from "react";
import { t } from "ttag";

import Input from "metabase/core/components/Input";
import Ellipsified from "metabase/core/components/Ellipsified";
import Icon from "metabase/components/Icon";

import type { DashboardOrderedCard } from "metabase-types/api";
import { isEmpty } from "metabase/lib/validate";

import { settings, LinkCardSettings } from "./LinkVizSettings";

import {
  EditLinkCardWrapper,
  DisplayLinkCardWrapper,
  CardLink,
} from "./LinkViz.styled";

export interface LinkVizProps {
  dashcard: DashboardOrderedCard;
  isEditing: boolean;
  isPreviewing: boolean;
  isSettings: boolean;
  onUpdateVisualizationSettings: (
    newSettings: Partial<LinkCardSettings>,
  ) => void;
  settings: LinkCardSettings;
}

function LinkViz({
  dashcard,
  isEditing,
  isPreviewing,
  isSettings,
  onUpdateVisualizationSettings,
  settings,
}: LinkVizProps) {
  const {
    link: { url },
  } = settings;

  const isNew = !!dashcard?.justAdded;

  const handleLinkChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    onUpdateVisualizationSettings({ link: { url: e.currentTarget.value } });

  const showEditBox = isEditing && !isPreviewing && !isSettings;

  if (showEditBox) {
    return (
      <EditLinkCardWrapper>
        <Input
          autoFocus={isNew}
          placeholder={"https://example.com"}
          value={url ?? ""}
          onChange={handleLinkChange}
          fullWidth
          // the dashcard really wants to turn all mouse events into drag events
          onMouseDown={e => e.stopPropagation()}
        />
      </EditLinkCardWrapper>
    );
  }

  const displayIcon = isEmpty(url) ? "question" : "link";

  return (
    <DisplayLinkCardWrapper>
      <CardLink to={url ?? ""} target="_blank" rel="noreferrer">
        <Icon name={displayIcon} />
        <Ellipsified style={{ minWidth: 0 }}>
          {isEmpty(url) ? t`Choose a link` : url}
        </Ellipsified>
      </CardLink>
    </DisplayLinkCardWrapper>
  );
}

export default Object.assign(LinkViz, settings);
