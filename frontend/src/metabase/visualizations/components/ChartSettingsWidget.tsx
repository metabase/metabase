import cx from "classnames";
import type { CSSProperties, ComponentType } from "react";

import FormS from "metabase/css/components/form.module.css";
import { PLUGIN_CUSTOM_VIZ } from "metabase/plugins";
import { Box, Group, Icon, Text, Tooltip } from "metabase/ui";
import { checkNotNull } from "metabase/utils/types";
import type { CustomVizSettingWidgetProps } from "metabase/viz-core";
import type { VisualizationSettings, WidgetMount } from "metabase-types/api";

import S from "./ChartSettingsWidget.module.css";

export type ChartSettingsWidgetVariant = "default" | "form-field";

type Props = {
  title?: string;
  description?: string;
  hint?: string;
  hidden?: boolean;
  widget?:
    | string
    | ComponentType<{ id: string }>
    | WidgetMount<CustomVizSettingWidgetProps>;
  inline?: boolean;
  props?: Record<string, unknown>;
  variant?: ChartSettingsWidgetVariant;
  dataTestId?: string;
  id: string;
  value?: unknown;
  onChange?: (value?: unknown) => void;
  onChangeSettings?: (settings: Partial<VisualizationSettings>) => void;
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
    <Box
      hidden={hidden}
      className={cx(S.root, {
        [FormS.FormField]: isFormField,
        [S.inline]: inline && !hidden,
      })}
      mb="lg"
      data-testid={dataTestId ?? `chart-settings-widget-${extraWidgetProps.id}`}
      data-field-title={title}
      style={style}
    >
      {title && (
        <Group align="center" gap="xs" mb={inline && !hidden ? 0 : "sm"}>
          <Text
            component="label"
            fw="bold"
            fz={isFormField ? "0.75rem" : undefined}
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
      {Widget &&
        (PLUGIN_CUSTOM_VIZ.isWidgetMount(Widget) ? (
          <PLUGIN_CUSTOM_VIZ.CustomVizSettingWidget
            mount={Widget}
            widgetProps={{
              ...props, // spread first so a plugin's getProps can't override the base props
              id: extraWidgetProps.id,
              value: extraWidgetProps.value,
              onChange: checkNotNull(extraWidgetProps.onChange),
              onChangeSettings: checkNotNull(extraWidgetProps.onChangeSettings),
            }}
          />
        ) : (
          <Widget {...extraWidgetProps} {...props} />
        ))}
    </Box>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ChartSettingsWidget;
