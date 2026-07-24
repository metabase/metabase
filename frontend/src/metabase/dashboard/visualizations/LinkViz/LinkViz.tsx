import { useEffect, useMemo, useState } from "react";
import { usePrevious } from "react-use";
import _ from "underscore";

import { useToggle } from "metabase/common/hooks/use-toggle";
import { getParameterValues } from "metabase/dashboard/selectors";
import { fillParametersInText } from "metabase/dashboard/visualizations/parameter-substitution";
import { SearchResults } from "metabase/nav/components/search/SearchResults";
import { useSelector } from "metabase/redux";
import { Popover, TextInput } from "metabase/ui";
import { modelToUrl } from "metabase/urls";
import { getUrlTarget } from "metabase/visualizations/lib/open-url";
import type {
  Dashboard,
  DashboardCard,
  LinkCardSettings,
  SearchModel,
  UnrestrictedLinkEntity,
  VirtualDashboardCard,
  VisualizationSettings,
} from "metabase-types/api";
import { isRestrictedLinkEntity } from "metabase-types/guards/dashboard";

import {
  EntityDisplay,
  RestrictedEntityDisplay,
  UrlLinkDisplay,
} from "./EntityDisplay";
import {
  CardLink,
  DisplayLinkCardWrapper,
  EditLinkCardWrapper,
  ExternalLink,
  SearchResultsContainer,
  StyledRecentsList,
} from "./LinkViz.styled";
import { settings } from "./LinkVizSettings";
import { isUrlString } from "./utils";

const MODELS_TO_SEARCH: SearchModel[] = [
  "card",
  "dataset",
  "dashboard",
  "collection",
  "database",
  "table",
  "document",
];

export interface LinkVizProps {
  dashcard?: DashboardCard;
  dashboard?: Dashboard;
  isEditing: boolean;
  onUpdateVisualizationSettings: (
    newSettings: Partial<VirtualDashboardCard["visualization_settings"]>,
  ) => void;
  settings: VisualizationSettings & {
    link?: LinkCardSettings;
  };
}

function LinkVizInner({
  dashcard,
  dashboard,
  isEditing,
  onUpdateVisualizationSettings,
  settings,
}: LinkVizProps) {
  const parameterValues = useSelector(getParameterValues);
  const { url, entity } = settings.link ?? {};

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

  const interpolatedUrl = useMemo(
    () =>
      dashboard != null
        ? fillParametersInText({
            dashcard,
            dashboard,
            parameterValues,
            text: url ?? "",
            urlEncode: true,
          })
        : (url ?? ""),
    [dashboard, dashcard, parameterValues, url],
  );

  if (entity) {
    if (isRestrictedLinkEntity(entity)) {
      return (
        <EditLinkCardWrapper>
          <RestrictedEntityDisplay />
        </EditLinkCardWrapper>
      );
    }

    const linkEntity = {
      ...entity,
      database_id: entity.db_id ?? entity.database_id,
      table_id: entity.model === "table" ? entity.id : undefined,
      collection: {},
    };

    if (isEditing) {
      return (
        <EditLinkCardWrapper data-testid="entity-edit-display-link">
          <EntityDisplay entity={linkEntity} showDescription={false} />
        </EditLinkCardWrapper>
      );
    }

    return (
      <DisplayLinkCardWrapper>
        <CardLink
          data-testid="entity-view-display-link"
          to={modelToUrl(linkEntity)}
          rel="noreferrer"
          role="link"
        >
          <EntityDisplay entity={linkEntity} showDescription />
        </CardLink>
      </DisplayLinkCardWrapper>
    );
  }

  if (isEditing) {
    return (
      <EditLinkCardWrapper data-testid="custom-edit-text-link">
        <Popover opened={inputIsFocused && !isUrlString(url)} position="bottom">
          <Popover.Target>
            <TextInput
              value={url ?? ""}
              autoFocus={autoFocus}
              placeholder={"https://example.com"}
              onChange={(e) => handleLinkChange(e.target.value)}
              onFocus={onFocusInput}
              // we need to debounce this or it may close the popover before the click event can fire
              onBlur={_.debounce(onBlurInput, 100)}
              // the dashcard really wants to turn all mouse events into drag events
              onMouseDown={(e) => e.stopPropagation()}
              size="sm"
              // DashEditing disables pointer-events on card content; the Input
              // wrapper's `none` breaks inheritance, so re-enable on both root
              // and input or the field can't be clicked/typed into.
              styles={{
                root: { pointerEvents: "all" },
                input: { pointerEvents: "all" },
              }}
            />
          </Popover.Target>
          <Popover.Dropdown>
            {!interpolatedUrl?.trim?.().length && !entity ? (
              <StyledRecentsList onClick={handleEntitySelect} />
            ) : (
              <SearchResultsContainer>
                <SearchResults
                  searchText={url?.trim()}
                  forceEntitySelect
                  onEntitySelect={handleEntitySelect}
                  models={MODELS_TO_SEARCH}
                  context="entity-picker"
                />
              </SearchResultsContainer>
            )}
          </Popover.Dropdown>
        </Popover>
      </EditLinkCardWrapper>
    );
  }

  // external link
  return (
    <DisplayLinkCardWrapper data-testid="custom-view-text-link">
      <ExternalLink
        href={interpolatedUrl ?? ""}
        target={getUrlTarget(url)}
        rel="noreferrer"
      >
        <UrlLinkDisplay url={interpolatedUrl} />
      </ExternalLink>
    </DisplayLinkCardWrapper>
  );
}

export const LinkViz = Object.assign(LinkVizInner, settings);
