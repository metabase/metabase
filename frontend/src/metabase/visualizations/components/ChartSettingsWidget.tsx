import cx from "classnames";

import PopoverS from "metabase/components/Popover/Popover.module.css";
import FormS from "metabase/css/components/form.module.css";
import { Box, Group, Icon, Text, Tooltip } from "metabase/ui";

import type { Widget } from "./ChartSettings";
import { Root } from "./ChartSettingsWidget.styled";

type Props = {
  description?: string;
  hint?: string;
  noPadding?: boolean;
  variant?: "default" | "form-field";
  borderBottom?: boolean;
  dataTestId?: string;
} & Pick<
  Widget,
  | "id"
  | "props"
  | "widget"
  | "disabled"
  | "inline"
  | "hidden"
  | "title"
  | "marginBottom"
>;

const ChartSettingsWidget = ({
  title,
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
      className={cx({
        [FormS.FormField]: isFormField,
        [PopoverS.FormField]: isFormField,
      })}
      inline={inline}
      marginBottom={marginBottom}
      data-testid={dataTestId ?? `chart-settings-widget-${extraWidgetProps.id}`}
      data-field-title={title}
      borderBottom={borderBottom}
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
