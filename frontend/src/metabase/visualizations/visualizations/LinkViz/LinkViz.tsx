import React from "react";
import { t } from "ttag";

import Input from "metabase/core/components/Input";
import Ellipsified from "metabase/core/components/Ellipsified";
import { FieldLabelWithContainer } from "metabase/core/components/FormField/FormField.styled";
import {
  settings,
  getSettingsStyle,
  LinkCardSettings,
} from "./LinkVizSettings";

import {
  EditLinkCardWrapper,
  DisplayLinkCardWrapper,
  CardLink,
} from "./LinkViz.styled";

interface LinkVizProps {
  isEditing: boolean;
  isPreviewing: boolean;
  isSettings: boolean;
  onUpdateVisualizationSettings: (
    newSettings: Partial<LinkCardSettings>,
  ) => void;
  settings: LinkCardSettings;
}

function LinkViz({
  isEditing,
  isPreviewing,
  isSettings,
  onUpdateVisualizationSettings,
  settings,
}: LinkVizProps) {
  const {
    link: { url },
  } = settings;

  const handleLinkChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    onUpdateVisualizationSettings({ link: { url: e.currentTarget.value } });

  const showEditBox = isEditing && !isPreviewing && !isSettings;

  if (showEditBox) {
    return (
      <EditLinkCardWrapper>
        <FieldLabelWithContainer>{t`Link url`}</FieldLabelWithContainer>
        <Input
          value={url ?? ""}
          onChange={handleLinkChange}
          fullWidth
          // the dashcard really wants to turn all mouse events into drag events
          onMouseDown={e => e.stopPropagation()}
        />
      </EditLinkCardWrapper>
    );
  }

  return (
    <DisplayLinkCardWrapper alignmentSettings={getSettingsStyle(settings)}>
      <Ellipsified>
        <CardLink to={url ?? ""} target="_blank" rel="noreferrer">
          {url ?? t`Choose a link`}
        </CardLink>
      </Ellipsified>
    </DisplayLinkCardWrapper>
  );
}

export default Object.assign(LinkViz, settings);
