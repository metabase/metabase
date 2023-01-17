import React, { useState } from "react";
import { withRouter } from "react-router";
import cx from "classnames";
import type { Location } from "history";

import TitleAndDescription from "metabase/components/TitleAndDescription";

import { useOnMount } from "metabase/hooks/use-on-mount";
import { isWithinIframe, initializeIframeResizer } from "metabase/lib/dom";
import { parseHashOptions } from "metabase/lib/browser";
import MetabaseSettings from "metabase/lib/settings";

import SyncedParametersList from "metabase/parameters/components/SyncedParametersList/SyncedParametersList";

import type { Dashboard, Parameter, ParameterId } from "metabase-types/api";
import type { ParameterValueOrArray } from "metabase-types/types/Parameter";

import { getValuePopulatedParameters } from "metabase-lib/parameters/utils/parameter-values";

import LogoBadge from "./LogoBadge";
import {
  Root,
  ContentContainer,
  Header,
  Body,
  Footer,
  ActionButtonsContainer,
} from "./EmbedFrame.styled";
import "./EmbedFrame.css";

interface OwnProps {
  className?: string;
  children: React.ReactNode;
  name?: string;
  description?: string;
  dashboard?: Dashboard;
  actionButtons: JSX.Element[];
  parameters: Parameter[];
  parameterValues: Record<ParameterId, ParameterValueOrArray>;
  setParameterValue: (parameterId: ParameterId, value: any) => void;
}

type Props = OwnProps & {
  location: Location;
};

interface HashOptions {
  bordered?: boolean;
  titled?: boolean;
  theme?: string;
  hide_parameters?: string;
  hide_download_button?: boolean;
}

function EmbedFrame({
  className,
  children,
  name,
  description,
  dashboard,
  actionButtons,
  location,
  parameters,
  parameterValues,
  setParameterValue,
}: Props) {
  const [hasInnerScroll, setInnerScroll] = useState(true);

  useOnMount(() => {
    initializeIframeResizer(() => setInnerScroll(false));
  });

  const {
    bordered = isWithinIframe(),
    titled = true,
    theme,
    hide_parameters,
    hide_download_button,
  } = parseHashOptions(location.hash) as HashOptions;

  const showFooter =
    !MetabaseSettings.hideEmbedBranding() ||
    (!hide_download_button && actionButtons);

  const finalName = titled ? name : null;
  const hasParameters = parameters?.length > 0;
  const hasHeader = Boolean(finalName || hasParameters);

  return (
    <Root
      hasScroll={hasInnerScroll}
      isBordered={bordered}
      className={cx("EmbedFrame", className, {
        [`Theme--${theme}`]: !!theme,
      })}
    >
      <ContentContainer hasScroll={hasInnerScroll}>
        {hasHeader && (
          <Header className="EmbedFrame-header">
            {finalName && (
              <TitleAndDescription
                title={finalName}
                description={description}
                className="my2"
              />
            )}
            {hasParameters && (
              <div className="flex">
                <SyncedParametersList
                  className="mt1"
                  dashboard={dashboard}
                  parameters={getValuePopulatedParameters(
                    parameters,
                    parameterValues,
                  )}
                  setParameterValue={setParameterValue}
                  hideParameters={hide_parameters}
                />
              </div>
            )}
          </Header>
        )}
        <Body>{children}</Body>
      </ContentContainer>
      {showFooter && (
        <Footer className="EmbedFrame-footer">
          {!MetabaseSettings.hideEmbedBranding() && (
            <LogoBadge dark={theme === "night"} />
          )}
          {actionButtons && (
            <ActionButtonsContainer>{actionButtons}</ActionButtonsContainer>
          )}
        </Footer>
      )}
    </Root>
  );
}

export default withRouter(EmbedFrame);
