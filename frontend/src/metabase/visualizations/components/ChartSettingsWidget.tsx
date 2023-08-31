import type * as React from "react";
import cx from "classnames";

import { Button } from "metabase/ui";

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
  widget?: React.ComponentType<{ id: string }>;
  inline?: boolean;
  marginBottom?: string;
  props?: Record<string, unknown>;
  noPadding?: boolean;
  variant?: "default" | "form-field";
  borderBottom?: boolean;
  dataTestId?: string;
  id: string;
  settingsLink?: {
    text: string;
    settingKey: string;
    showWhen?: (props?: Record<any, any>) => boolean;
  };
  handleWidgetLink: (key: String) => void;
};

const ChartSettingsWidget = ({
  title,
  settingsLink,
  description,
  hint,
  hidden,
  disabled,
  variant = "default",
  inline = false,
  marginBottom = undefined,
  widget: Widget,
  dataTestId,
  props,
  // disables X padding for certain widgets so divider line extends to edge
  noPadding,
  borderBottom,
  handleWidgetLink,
  // NOTE: pass along special props to support:
  // * adding additional fields
  // * substituting widgets
  ...extraWidgetProps
}: Props) => {
  const isFormField = variant === "form-field";
  const showSettingsLink = !!settingsLink && !extraWidgetProps.dashboard;

  // console.log(settingsLink, showSettingsLink);
  return (
    <Root
      hidden={hidden}
      noPadding={noPadding}
      disabled={disabled}
      className={cx({ "Form-field": isFormField })}
      inline={inline}
      marginBottom={marginBottom}
      data-testid={dataTestId}
      borderBottom={borderBottom}
    >
      {title && (
        <Title
          variant={variant}
          className={cx({ "Form-label": isFormField })}
          htmlFor={extraWidgetProps.id}
        >
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
      {showSettingsLink && (
        <Button
          mb="0.25rem"
          pl="0"
          variant="subtle"
          onClick={() => handleWidgetLink(settingsLink.settingKey)}
        >
          {settingsLink.text}
        </Button>
      )}
      {description && <Description>{description}</Description>}
      {Widget && <Widget {...extraWidgetProps} {...props} />}
    </Root>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ChartSettingsWidget;
