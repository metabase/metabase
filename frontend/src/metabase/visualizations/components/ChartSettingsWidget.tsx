import React, { useState } from "react";
import cx from "classnames";

import {
  Root,
  Title,
  Description,
  InfoIconContainer,
  InfoIcon,
} from "./ChartSettingsWidget.styled";
import FormMessage from "metabase/components/form/FormMessage";
import { t } from "ttag";

type Props = {
  title?: string;
  description?: string;
  hint?: string;
  hidden?: boolean;
  disabled?: boolean;
  widget?: React.ComponentType<{
    onChange?: (input: string) => void;
    parentId?: string;
    value?: string;
    id?: string;
  }>;
  props?: Record<string, unknown>;
  noPadding?: boolean;
  variant?: "default" | "form-field";
  columns?: { fields: any };
  parentId?: string;
  id?: string;
  value?: string;
  onChange?: (input: string) => void;
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
  columns,
  parentId,
  id,
  value,
  onChange,
  // disables X padding for certain widgets so divider line extends to edge
  noPadding,
  // NOTE: pass along special props to support:
  // * adding additional fields
  // * substituting widgets
  ...extraWidgetProps
}: Props) => {
  const isFormField = variant === "form-field";
  const [error, setError] = useState("");
  const [lastValue, setLastValue] = useState("");

  const handleInput = (input: string) => {
    if (parentId === "column_settings" && id === "link_url") {
      setError("");
      setLastValue("");
      const fields = Object.keys(columns?.fields);
      const fieldNames = fields.map(
        key => `{{${columns?.fields[key].name.toLowerCase()}}}`,
      );
      const check = fieldNames.some(fieldName => {
        if (input.includes("{{") && input.includes("}}")) {
          return input.toLowerCase().includes(fieldName);
        } else {
          return true;
        }
      });
      if (check) {
        onChange?.(input);
      } else {
        setLastValue(input);
        setError(
          t`Please use the base column name as the variable. For example: {{column_name}}`,
        );
      }
    } else {
      onChange?.(input);
    }
  };
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
      {Widget && (
        <Widget
          {...extraWidgetProps}
          {...props}
          id={id}
          onChange={handleInput}
          parentId={parentId}
          value={lastValue || value}
        />
      )}
      {error && <FormMessage message={error}></FormMessage>}
    </Root>
  );
};

export default ChartSettingsWidget;
