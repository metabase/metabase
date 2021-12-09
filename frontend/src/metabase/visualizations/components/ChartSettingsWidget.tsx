import React from "react";

import Icon from "metabase/components/Icon";

import {
  Root,
  Title,
  Description,
  InfoIconContainer,
} from "./ChartSettingsWidget.styled";

type Props = {
  title?: string;
  description?: string;
  hint?: string;
  hidden?: boolean;
  disabled?: boolean;
  widget?: React.ComponentType;
  props?: Record<string, unknown>;
  noPadding?: boolean;
};

const ChartSettingsWidget = ({
  title,
  description,
  hint,
  hidden,
  disabled,
  widget: Widget,
  props,
  // disables X padding for certain widgets so divider line extends to edge
  noPadding,
  // NOTE: pass along special props to support:
  // * adding additional fields
  // * substituting widgets
  ...extraWidgetProps
}: Props) => {
  return (
    <Root hidden={hidden} noPadding={noPadding} disabled={disabled}>
      {title && (
        <Title>
          {title}
          {hint && (
            <InfoIconContainer>
              <Icon name="info" size={14} tooltip={hint} />
            </InfoIconContainer>
          )}
        </Title>
      )}
      {description && <Description>{description}</Description>}
      {Widget && <Widget {...extraWidgetProps} {...props} />}
    </Root>
  );
};

export default ChartSettingsWidget;
