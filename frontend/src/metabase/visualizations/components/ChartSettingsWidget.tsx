import React from "react";
import cx from "classnames";

import {
  Root,
  Title,
  Description,
  InfoIconContainer,
  InfoIcon,
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
  variant?: "default" | "form-field";
};

const ChartSettingsWidget = ({
  title,
  description,
  hint,
  hidden,
  disabled,
  variant = "default",
  widget: Widget,
  props,
  // disables X padding for certain widgets so divider line extends to edge
  noPadding,
  // NOTE: pass along special props to support:
  // * adding additional fields
  // * substituting widgets
  ...extraWidgetProps
}: Props) => {
  const isFormField = variant === "form-field";
  return (
    <Root
      hidden={hidden}
      noPadding={noPadding}
      disabled={disabled}
      className={cx({ "Form-field": isFormField })}
    >
      {title && (
        <Title variant={variant} className={cx({ "Form-label": isFormField })}>
          {title}
          {hint && (
            <InfoIconContainer>
              <InfoIcon
                name="info"
                variant={variant}
                size={isFormField ? 12 : 14}
                tooltip={hint}
              />
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
