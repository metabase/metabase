import cx from "classnames";
import type { CSSProperties, ComponentType } from "react";

import FormS from "metabase/css/components/form.module.css";
import { Box, Group, Icon, Text, Tooltip } from "metabase/ui";

import { Root } from "./ChartSettingsWidget.styled";

type Props = {
  title?: string;
  description?: string;
  hint?: string;
  hidden?: boolean;
  widget?: string | ComponentType<{ id: string }>;
  inline?: boolean;
  props?: Record<string, unknown>;
  variant?: "default" | "form-field";
  dataTestId?: string;
  id: string;
  style?: CSSProperties;
};

const ChartSettingsWidget = ({
  title,
  description,
  hint,
  hidden,
  variant = "default",
  inline = false,
  widget: Widget,
  dataTestId,
  props,
  style,
  // NOTE: pass along special props to support:
  // * adding additional fields
  // * substituting widgets
  ...extraWidgetProps
}: Props) => {
  const isFormField = variant === "form-field";
  return (
    <Root
      hidden={hidden}
      className={cx({
        [FormS.FormField]: isFormField,
      })}
      inline={inline}
      data-testid={dataTestId ?? `chart-settings-widget-${extraWidgetProps.id}`}
      data-field-title={title}
      style={style}
    >
      {title && (
        <Group align="center" gap="xs" mb={inline && !hidden ? 0 : "sm"}>
          <Text
            component="label"
            fw="bold"
            fz={isFormField ? "0.88em" : undefined}
            lh={variant === "default" ? "normal" : "0.875rem"}
            htmlFor={extraWidgetProps.id}
          >
            {title}
          </Text>
          {hint && (
            <Tooltip label={hint}>
              <Icon name="info" size={14} />
            </Tooltip>
          )}
        </Group>
      )}
      {description && (
        <Box component="span" mb="sm">
          {description}
        </Box>
      )}
      {Widget && <Widget {...extraWidgetProps} {...props} />}
    </Root>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ChartSettingsWidget;
