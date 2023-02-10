import React, { useState } from "react";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import Input from "metabase/core/components/Input";
import SearchResults from "metabase/nav/components/SearchResults";
import TippyPopover from "metabase/components/Popover/TippyPopover";
import Ellipsified from "metabase/core/components/Ellipsified";
import { FieldLabelWithContainer } from "metabase/core/components/FormField/FormField.styled";
import SearchResult from "metabase/search/components/SearchResult";

import { isEmpty } from "metabase/lib/validate";
import type { SearchEntity } from "metabase-types/api";
import { useToggle } from "metabase/hooks/use-toggle";
import Search from "metabase/entities/search";
import Icon from "metabase/components/Icon";

import type { DashboardOrderedCard } from "metabase-types/api";
import { isEmpty } from "metabase/lib/validate";

import { settings, LinkCardSettings } from "./LinkVizSettings";

import {
  EditLinkCardWrapper,
  DisplayLinkCardWrapper,
  CardLink,
  SearchResultsContainer,
  EntityEditContainer,
} from "./LinkViz.styled";

import { isUrlString } from "./utils";

interface LinkVizProps {
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
    link: { url, entity },
  } = settings;

  const [autoFocus, setAutoFocus] = useState(false);

  const handleLinkChange = (newLink: string) =>
    onUpdateVisualizationSettings({ link: { url: newLink } });

  const handleEntitySelect = (entity: SearchEntity) => {
    onUpdateVisualizationSettings({
      link: {
        entity, // what happens when this data is stale?
        url: entity.name,
      },
    });
  };

  const [inputIsFocused, { turnOn: onFocusInput, turnOff: onBlurInput }] =
    useToggle();
  const isNew = !!dashcard?.justAdded;

  const showEditBox = isEditing && !isPreviewing && !isSettings;
  const wrappedEntity = Search.wrapEntity(entity);

  if (showEditBox) {
    return (
      <EditLinkCardWrapper>
        {!!entity && (
          <EntityEditContainer>
            <SearchResult result={wrappedEntity} compact />
            <Button
              onClick={() => {
                handleLinkChange(entity.name);
                setAutoFocus(true);
              }}
              icon="search"
              onlyIcon
            />
          </EntityEditContainer>
        )}
        {!entity && (
          <>
            <FieldLabelWithContainer>{t`Link`}</FieldLabelWithContainer>
            <TippyPopover
              visible={!!url.length && inputIsFocused && !isUrlString(url)}
              content={
                <SearchResultsContainer>
                  <SearchResults
                    searchText={url.trim()}
                    onEntitySelect={handleEntitySelect}
                  />
                </SearchResultsContainer>
              }
              placement="bottom"
            >
              <Input
                type="search"
                value={url ?? ""}
                autoFocus={autoFocus}
                onChange={e => handleLinkChange(e.target.value)}
                fullWidth
                onFocus={onFocusInput}
                onBlur={onBlurInput}
                // the dashcard really wants to turn all mouse events into drag events
                onMouseDown={e => e.stopPropagation()}
              />
            </TippyPopover>
          </>
        )}
      </EditLinkCardWrapper>
    );
  }

  if (entity) {
    return (
      <DisplayLinkCardWrapper alignmentSettings={getSettingsStyle(settings)}>
        <SearchResult result={wrappedEntity} compact />
      </DisplayLinkCardWrapper>
    );
  }
  
  const displayIcon = isEmpty(url) ? "question" : "link";
  
  return (
    <DisplayLinkCardWrapper>
      <Ellipsified>
        <CardLink to={url ? url : ""} target="_blank" rel="noreferrer">
          <Icon name={displayIcon} />
          {!isEmpty(url) ? url : t`Select a link`}
        </CardLink>
      </Ellipsified>
    </DisplayLinkCardWrapper>
  );
}

export default Object.assign(LinkViz, settings);
