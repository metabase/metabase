import React, { useState } from "react";
import { t } from "ttag";

import Input from "metabase/core/components/Input";
import SearchResults from "metabase/nav/components/SearchResults";
import TippyPopover from "metabase/components/Popover/TippyPopover";
import Ellipsified from "metabase/core/components/Ellipsified";
import Icon from "metabase/components/Icon";

import type { DashboardOrderedCard } from "metabase-types/api";

import { useToggle } from "metabase/hooks/use-toggle";
import Search from "metabase/entities/search";

import { isEmpty } from "metabase/lib/validate";
import { color } from "metabase/lib/colors";

import { EntityDisplay } from "./EntityDisplay";

import { settings } from "./LinkVizSettings";

import type { LinkEntity, LinkCardSettings } from "./types";

import {
  EditLinkCardWrapper,
  DisplayLinkCardWrapper,
  CardLink,
  SearchResultsContainer,
  EntityEditContainer,
  Button,
} from "./LinkViz.styled";

import { isUrlString } from "./utils";

export interface LinkVizProps {
  dashcard: DashboardOrderedCard;
  isEditing: boolean;
  onUpdateVisualizationSettings: (
    newSettings: Partial<LinkCardSettings>,
  ) => void;
  settings: LinkCardSettings;
}

function LinkViz({
  dashcard,
  isEditing,
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

  const handleEntitySelect = (entity: LinkEntity) => {
    onUpdateVisualizationSettings({
      link: {
        entity: {
          id: entity.id,
          database_id:
            entity.model === "table" ? entity.database_id : undefined,
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

  if (entity) {
    const wrappedEntity = Search.wrapEntity({
      ...entity,
      table_id: entity.model === "table" ? entity.id : undefined,
      collection: {},
    });

    if (isEditing) {
      return (
        <EditLinkCardWrapper>
          <EntityEditContainer>
            <Button
              onClick={() => {
                handleLinkChange(entity.name);
                setAutoFocus(true);
              }}
              onlyText
            >
              <EntityDisplay entity={wrappedEntity} showDescription={false} />
            </Button>
          </EntityEditContainer>
        </EditLinkCardWrapper>
      );
    }

    return (
      <DisplayLinkCardWrapper>
        <CardLink to={wrappedEntity.getUrl()} target="_blank" rel="noreferrer">
          <EntityDisplay entity={wrappedEntity} showDescription />
        </CardLink>
      </DisplayLinkCardWrapper>
    );
  }

  if (isEditing) {
    return (
      <EditLinkCardWrapper>
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
      </EditLinkCardWrapper>
    );
  }

  const urlIcon = isEmpty(url) ? "question" : "link";

  return (
    <DisplayLinkCardWrapper>
      <CardLink to={url ? url : ""} target="_blank" rel="noreferrer">
        <Icon name={urlIcon} ml={1} mr={1} color={color("brand")} />
        <Ellipsified>{!isEmpty(url) ? url : t`Choose a link`}</Ellipsified>
      </CardLink>
    </DisplayLinkCardWrapper>
  );
}

export default Object.assign(LinkViz, settings);
