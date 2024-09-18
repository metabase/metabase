import { useEffect, useState } from "react";
import { usePrevious } from "react-use";
import _ from "underscore";

import { useToggle } from "metabase/hooks/use-toggle";
import type {
  LinkCardSettings,
  VirtualDashboardCard,
} from "metabase-types/api";

import {
  DisplayLinkCardWrapper,
  EditLinkCardWrapper,
  StyledInput,
} from "./IFrameViz.styled";
import { settings } from "./IFrameVizSettings";

export interface IFrameVizProps {
  dashcard: VirtualDashboardCard;
  isEditing: boolean;
  onUpdateVisualizationSettings: (
    newSettings: Partial<VirtualDashboardCard["visualization_settings"]>,
  ) => void;
  settings: VirtualDashboardCard["visualization_settings"] & {
    link: LinkCardSettings;
  };
  isEditingParameter?: boolean;
  width: number;
  height: number;
}

function IFrameVizInner({
  dashcard,
  isEditing,
  onUpdateVisualizationSettings,
  settings,
  isEditingParameter,
  width,
  height,
}: IFrameVizProps) {
  const {
    link: { url },
  } = settings;

  const isNew = !!dashcard?.justAdded;
  const [autoFocus, setAutoFocus] = useState(isNew);
  const previousUrl = usePrevious(url);

  const handleLinkChange = (newLink: string) =>
    onUpdateVisualizationSettings({ link: { url: newLink } });

  const [_inputIsFocused, { turnOn: onFocusInput, turnOff: onBlurInput }] =
    useToggle();

  useEffect(() => {
    // if the url was auto-filled from the entity, focus the input
    if (previousUrl === undefined && !!url) {
      setAutoFocus(true);
    }
  }, [previousUrl, url]);

  const processIframeUrl = (iframeUrl: string) => {
    if (iframeUrl.includes("<iframe")) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(iframeUrl, "text/html");
      const iframe = doc.querySelector("iframe");

      if (iframe) {
        if (!iframe.width) {
          iframe.width = `${width}`;
        }
        if (!iframe.height) {
          iframe.height = `${height}`;
        }
        iframe.frameBorder = "0";
        return iframe.outerHTML;
      }
    }
    return "";
  };

  if (isEditing && !isEditingParameter) {
    return (
      <EditLinkCardWrapper data-testid="custom-edit-text-link">
        <StyledInput
          fullWidth
          value={url ?? ""}
          autoFocus={autoFocus}
          placeholder={`<iframe src="https://example.com" />`}
          onChange={e => handleLinkChange(e.target.value)}
          onFocus={onFocusInput}
          // we need to debounce this or it may close the popover before the click event can fire
          onBlur={_.debounce(onBlurInput, 100)}
          // the dashcard really wants to turn all mouse events into drag events
          onMouseDown={e => e.stopPropagation()}
        />
      </EditLinkCardWrapper>
    );
  }

  return (
    <DisplayLinkCardWrapper
      data-testid="custom-view-text-link"
      fade={isEditingParameter}
      dangerouslySetInnerHTML={{ __html: processIframeUrl(url ?? "") }}
    ></DisplayLinkCardWrapper>
  );
}

export const IFrameViz = Object.assign(IFrameVizInner, settings);
