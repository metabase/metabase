import { useState, useEffect } from "react";
import { usePrevious } from "react-use";
import _ from "underscore";

import Input from "metabase/core/components/Input";
import SearchResults from "metabase/nav/components/SearchResults";
import TippyPopover from "metabase/components/Popover/TippyPopover";

import type {
  DashboardOrderedCard,
  LinkCardSettings,
  UnrestrictedLinkEntity,
} from "metabase-types/api";

import { useToggle } from "metabase/hooks/use-toggle";
import Search from "metabase/entities/search";

import { isRestrictedLinkEntity } from "metabase-types/guards/dashboard";
import {
  EntityDisplay,
  UrlLinkDisplay,
  RestrictedEntityDisplay,
} from "./EntityDisplay";
import { settings } from "./LinkVizSettings";

import {
  EditLinkCardWrapper,
  DisplayLinkCardWrapper,
  CardLink,
  SearchResultsContainer,
  StyledRecentsList,
  ExternalLink,
} from "./LinkViz.styled";

import { isUrlString } from "./utils";
import { WrappedUnrestrictedLinkEntity } from "./types";

const MODELS_TO_SEARCH = [
  "card",
  "dataset",
  "dashboard",
  "collection",
  "database",
  "table",
];

export interface LinkVizProps {
  dashcard: DashboardOrderedCard;
  isEditing: boolean;
  onUpdateVisualizationSettings: (
    newSettings: Partial<DashboardOrderedCard["visualization_settings"]>,
  ) => void;
  settings: DashboardOrderedCard["visualization_settings"] & {
    link: LinkCardSettings;
  };
  isEditingParameter?: boolean;
}

function LinkVizInner({
  dashcard,
  isEditing,
  onUpdateVisualizationSettings,
  settings,
  isEditingParameter,
}: LinkVizProps) {
  const {
    link: { url, entity },
  } = settings;

  const isNew = !!dashcard?.justAdded;
  const [autoFocus, setAutoFocus] = useState(isNew);
  const previousUrl = usePrevious(url);

  const handleLinkChange = (newLink: string) =>
    onUpdateVisualizationSettings({ link: { url: newLink } });

  const handleEntitySelect = (entity: UnrestrictedLinkEntity) => {
    onUpdateVisualizationSettings({
      link: {
        entity: {
          id: entity.id,
          db_id: entity.model === "table" ? entity.database_id : undefined,
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

  useEffect(() => {
    // if the url was auto-filled from the entity, focus the input
    if (previousUrl === undefined && !!url) {
      setAutoFocus(true);
    }
  }, [previousUrl, url]);

  if (entity) {
    if (isRestrictedLinkEntity(entity)) {
      return (
        <EditLinkCardWrapper fade={isEditingParameter}>
          <RestrictedEntityDisplay />
        </EditLinkCardWrapper>
      );
    }

    const wrappedEntity: WrappedUnrestrictedLinkEntity = Search.wrapEntity({
      ...entity,
      database_id: entity.db_id ?? entity.database_id,
      table_id: entity.model === "table" ? entity.id : undefined,
      collection: {},
    });

    if (isEditing) {
      return (
        <EditLinkCardWrapper
          data-testid="entity-edit-display-link"
          fade={isEditingParameter}
        >
          <EntityDisplay entity={wrappedEntity} showDescription={false} />
        </EditLinkCardWrapper>
      );
    }

    return (
      <DisplayLinkCardWrapper>
        <CardLink
          data-testid="entity-view-display-link"
          to={wrappedEntity.getUrl()}
          rel="noreferrer"
          role="link"
        >
          <EntityDisplay entity={wrappedEntity} showDescription />
        </CardLink>
      </DisplayLinkCardWrapper>
    );
  }

  if (isEditing && !isEditingParameter) {
    return (
      <EditLinkCardWrapper data-testid="custom-edit-text-link">
        <TippyPopover
          visible={inputIsFocused && !isUrlString(url)}
          content={
            !url?.trim?.().length && !entity ? (
              <StyledRecentsList onClick={handleEntitySelect} />
            ) : (
              <SearchResultsContainer>
                <SearchResults
                  searchText={url?.trim()}
                  forceEntitySelect
                  onEntitySelect={handleEntitySelect}
                  models={MODELS_TO_SEARCH}
                />
              </SearchResultsContainer>
            )
          }
          placement="bottom"
        >
          <Input
            fullWidth
            value={url ?? ""}
            autoFocus={autoFocus}
            placeholder={"https://example.com"}
            onChange={e => handleLinkChange(e.target.value)}
            onFocus={onFocusInput}
            // we need to debounce this or it may close the popover before the click event can fire
            onBlur={_.debounce(onBlurInput, 100)}
            // the dashcard really wants to turn all mouse events into drag events
            onMouseDown={e => e.stopPropagation()}
          />
        </TippyPopover>
      </EditLinkCardWrapper>
    );
  }

  // external link
  return (
    <DisplayLinkCardWrapper
      data-testid="custom-view-text-link"
      fade={isEditingParameter}
    >
      <ExternalLink href={url ?? ""} target="_blank" rel="noreferrer">
        <UrlLinkDisplay url={url} />
      </ExternalLink>
    </DisplayLinkCardWrapper>
  );
}

export const LinkViz = Object.assign(LinkVizInner, settings);
