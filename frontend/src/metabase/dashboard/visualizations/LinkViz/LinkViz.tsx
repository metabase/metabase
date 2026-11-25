import cx from "classnames";
import { useEffect, useMemo, useState } from "react";
import { usePrevious } from "react-use";
import _ from "underscore";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { Link } from "metabase/common/components/Link";
import { useToggle } from "metabase/common/hooks/use-toggle";
import CS from "metabase/css/core/index.css";
import { getParameterValues } from "metabase/dashboard/selectors";
import { fillParametersInText } from "metabase/dashboard/visualizations/parameter-substitution";
import { RecentsList } from "metabase/nav/components/search/RecentsList";
import { SearchResults } from "metabase/nav/components/search/SearchResults";
import { useSelector } from "metabase/redux";
import { Box, Flex, Popover, TextInput } from "metabase/ui";
import { getUrlTarget, modelToUrl } from "metabase/urls";
import type {
  Dashboard,
  LinkCardSettings,
  SearchModel,
  UnrestrictedLinkEntity,
  VirtualDashboardCard,
} from "metabase-types/api";
import { isRestrictedLinkEntity } from "metabase-types/guards/dashboard";

import {
  EntityDisplay,
  RestrictedEntityDisplay,
  UrlLinkDisplay,
} from "./EntityDisplay";
import S from "./LinkViz.module.css";
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

const linkClassName = cx(S.link, CS.textBold, CS.textBrandHover);

export interface LinkVizProps {
  dashcard: VirtualDashboardCard;
  dashboard: Dashboard;
  isEditing: boolean;
  onUpdateVisualizationSettings: (
    newSettings: Partial<VirtualDashboardCard["visualization_settings"]>,
  ) => void;
  settings: VirtualDashboardCard["visualization_settings"] & {
    link: LinkCardSettings;
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

  const interpolatedUrl = useMemo(
    () =>
      fillParametersInText({
        dashcard,
        dashboard,
        parameterValues,
        text: url ?? "",
        urlEncode: true,
      }),
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
        <Link
          className={linkClassName}
          data-testid="entity-view-display-link"
          to={modelToUrl(linkEntity)}
          rel="noreferrer"
          role="link"
        >
          <EntityDisplay entity={linkEntity} showDescription />
        </Link>
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
              <RecentsList className={S.results} onClick={handleEntitySelect} />
            ) : (
              <Box className={S.results}>
                <SearchResults
                  searchText={url?.trim()}
                  forceEntitySelect
                  onEntitySelect={handleEntitySelect}
                  models={MODELS_TO_SEARCH}
                  context="entity-picker"
                />
              </Box>
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
        className={linkClassName}
        href={interpolatedUrl ?? ""}
        target={getUrlTarget(url)}
        rel="noreferrer"
      >
        <UrlLinkDisplay url={interpolatedUrl} />
      </ExternalLink>
    </DisplayLinkCardWrapper>
  );
}

type LinkCardWrapperProps = {
  children: React.ReactNode;
  "data-testid"?: string;
};

function EditLinkCardWrapper({ children, ...props }: LinkCardWrapperProps) {
  return (
    <Flex
      direction="column"
      justify="center"
      w="100%"
      h="100%"
      px="lg"
      {...props}
    >
      {children}
    </Flex>
  );
}

function DisplayLinkCardWrapper({ children, ...props }: LinkCardWrapperProps) {
  return (
    <Flex w="100%" h="100%" align="center" px="sm" {...props}>
      {children}
    </Flex>
  );
}

export const LinkViz = Object.assign(LinkVizInner, settings);
