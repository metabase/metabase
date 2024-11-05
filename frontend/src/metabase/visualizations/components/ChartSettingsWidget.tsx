import cx from "classnames";

import PopoverS from "metabase/components/Popover/Popover.module.css";
import FormS from "metabase/css/components/form.module.css";

import type { Widget } from "./ChartSettings/types";
import {
  Description,
  InfoIcon,
  InfoIconContainer,
  Root,
  Title,
} from "./ChartSettingsWidget.styled";

type Props = {
  title?: string;
  description?: string;
  hint?: string;
  hidden?: boolean;
  disabled?: boolean;
  widget?: Widget["widget"];
  inline?: boolean;
  marginBottom?: string;
  props?: Record<string, unknown>;
  noPadding?: boolean;
  variant?: "default" | "form-field";
  borderBottom?: boolean;
  dataTestId?: string;
  id: Widget["id"];
};

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
      data-testid={dataTestId}
      borderBottom={borderBottom}
    >
      {title && (
        <Title
          variant={variant}
          className={cx({ [FormS.FormLabel]: isFormField })}
          htmlFor={String(extraWidgetProps.id)}
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
      {description && <Description>{description}</Description>}
      {Widget && <Widget {...extraWidgetProps} {...props} />}
    </Root>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ChartSettingsWidget;
