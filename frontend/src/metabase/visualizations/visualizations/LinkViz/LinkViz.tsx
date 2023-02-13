import React, { useState } from "react";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import Input from "metabase/core/components/Input";
import SearchResults from "metabase/nav/components/SearchResults";
import TippyPopover from "metabase/components/Popover/TippyPopover";
import Ellipsified from "metabase/core/components/Ellipsified";
import Icon from "metabase/components/Icon";

import type { SearchEntity, DashboardOrderedCard } from "metabase-types/api";

import { useToggle } from "metabase/hooks/use-toggle";
import Search from "metabase/entities/search";
import Icon from "metabase/components/Icon";

import type { DashboardOrderedCard } from "metabase-types/api";
import { isEmpty } from "metabase/lib/validate";
import { color } from "metabase/lib/colors";

import { EntityDisplay } from "./EntityDisplay";

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

  const isNew = !!dashcard?.justAdded;
  const [autoFocus, setAutoFocus] = useState(isNew);

  const handleLinkChange = (newLink: string) =>
    onUpdateVisualizationSettings({ link: { url: newLink } });

  const handleEntitySelect = (entity: SearchEntity) => {
    onUpdateVisualizationSettings({
      link: {
        entity: {
          id: entity.id,
          name: entity.name,
          model: entity.model,
          description: entity.description,
          display: entity.display,
        },
      },
    });
  };

  const [inputIsFocused, { turnOn: onFocusInput, turnOff: onBlurInput }] =
    useToggle();

  const showEditor = isEditing && !isPreviewing && !isSettings;
  const wrappedEntity = Search.wrapEntity(entity);

  if (showEditor) {
    return (
      <EditLinkCardWrapper>
        {!!entity && (
          <EntityEditContainer>
            <EntityDisplay entity={wrappedEntity} showDescription={false} />
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
            <TippyPopover
              visible={!!url?.length && inputIsFocused && !isUrlString(url)}
              content={
                <SearchResultsContainer>
                  <SearchResults
                    searchText={url?.trim()}
                    onEntitySelect={handleEntitySelect}
                  />
                </SearchResultsContainer>
              }
              placement="bottom"
            >
              <Input
                fullWidth
                type="search"
                value={url ?? ""}
                autoFocus={autoFocus}
                placeholder={t`https://example.com`}
                onChange={e => handleLinkChange(e.target.value)}
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
      <DisplayLinkCardWrapper>
        <CardLink to={wrappedEntity.getUrl()} target="_blank" rel="noreferrer">
          <EntityDisplay entity={wrappedEntity} showDescription />
        </CardLink>
      </DisplayLinkCardWrapper>
    );
  }

  const urlIcon = isEmpty(url) ? "question" : "link";

  return (
    <DisplayLinkCardWrapper>
      <CardLink to={url ? url : ""} target="_blank" rel="noreferrer">
        <Icon name={urlIcon} ml={1} mr={1} color={color("brand")} />
        <Ellipsified>{!isEmpty(url) ? url : t`Select a link`}</Ellipsified>
      </CardLink>
    </DisplayLinkCardWrapper>
  );
}

export default Object.assign(LinkViz, settings);
