import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { type ReactNode, useMemo, useState } from "react";
import { t } from "ttag";

import { Sortable } from "metabase/common/components/Sortable";
import CS from "metabase/css/core/index.css";
import { useTranslateContent } from "metabase/i18n/hooks";
import FormattedParameterValue from "metabase/parameters/components/FormattedParameterValue";
import S from "metabase/parameters/components/ParameterValueWidget.module.css";
import { ParameterValueWidgetTrigger } from "metabase/parameters/components/ParameterValueWidgetTrigger";
import { getParameterIconName } from "metabase/parameters/utils/ui";
import { Box, Icon, Popover, type PopoverProps } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import {
  isBooleanParameter,
  isDateParameter,
  isStringParameter,
  isTemporalUnitParameter,
} from "metabase-lib/v1/parameters/utils/parameter-type";
import {
  areParameterValuesIdentical,
  parameterHasNoDisplayValue,
} from "metabase-lib/v1/parameters/utils/parameter-values";
import type { Dashboard, ParameterId } from "metabase-types/api";

import {
  ParameterDropdownWidget,
  isTextWidget,
} from "./ParameterDropdownWidget";
import { WidgetStatus } from "./WidgetStatus";

export type ParameterValueWidgetProps = {
  parameter: UiParameter;
  setValue: (value: any) => void;
  value: any;
  placeholder?: string;
  isEditing?: boolean;

  commitImmediately?: boolean;
  focusChanged?: (focused: boolean) => void;
  isFullscreen?: boolean;
  className?: string;
  parameters?: UiParameter[];
  dashboard?: Dashboard | null;
  question?: Question;
  setParameterValueToDefault?: (parameterId: ParameterId) => void;
  // This means the widget will take care of the default value.
  // Should be used for dashboards and native questions in the parameter bar,
  // Don't use in settings sidebars.
  enableRequiredBehavior?: boolean;
  mimicMantine?: boolean;
  isSortable?: boolean;
  prefix?: ReactNode;
} & Partial<PopoverProps>;

export const ParameterValueWidget = ({
  className,
  commitImmediately = false,
  dashboard,
  enableRequiredBehavior,
  focusChanged,
  isEditing = false,
  isFullscreen,
  isSortable = false,
  mimicMantine,
  parameter,
  parameters,
  placeholder,
  question,
  setParameterValueToDefault,
  setValue,
  value,
  prefix,
  ...popoverProps
}: ParameterValueWidgetProps) => {
  const tc = useTranslateContent();

  const [isFocused, setIsFocused] = useState(false);

  const hasValue = !parameterHasNoDisplayValue(value);
  const hasDefaultValue = !parameterHasNoDisplayValue(parameter.default);
  const fieldHasValueOrFocus = parameter.value != null || isFocused;
  const noPopover = hasNoPopover(parameter);
  const parameterTypeIcon = getParameterIconName(parameter);

  const [isOpen, { close, toggle }] = useDisclosure();

  const getOptionalActionIcon = () => {
    const { default: defaultValue } = parameter;

    if (
      hasDefaultValue &&
      !areParameterValuesIdentical(wrapArray(value), wrapArray(defaultValue))
    ) {
      return (
        <WidgetStatus
          className={S.widgetStatus}
          highlighted={fieldHasValueOrFocus}
          status="reset"
          onClick={() => {
            close();
            setParameterValueToDefault?.(parameter.id);
          }}
        />
      );
    }

    if (hasValue) {
      return (
        <WidgetStatus
          className={S.widgetStatus}
          highlighted={fieldHasValueOrFocus}
          status="clear"
          onClick={() => {
            setValue(null);
            close();
          }}
        />
      );
    }

    if (!hasNoPopover(parameter)) {
      return <WidgetStatus className={S.widgetStatus} status="empty" />;
    }
  };

  const getRequiredActionIcon = () => {
    const { required, default: defaultValue } = parameter;

    if (
      required &&
      hasDefaultValue &&
      !areParameterValuesIdentical(wrapArray(value), wrapArray(defaultValue))
    ) {
      return (
        <WidgetStatus
          className={S.widgetStatus}
          highlighted={fieldHasValueOrFocus}
          status="reset"
          onClick={() => setParameterValueToDefault?.(parameter.id)}
        />
      );
    }

    if (required && !hasDefaultValue && hasValue) {
      return (
        <WidgetStatus
          className={S.widgetStatus}
          highlighted={fieldHasValueOrFocus}
          status="clear"
          onClick={() => {
            setValue(null);
            close();
          }}
        />
      );
    }
  };

  const getActionIcon = () => {
    if (isFullscreen) {
      return null;
    }

    const icon =
      enableRequiredBehavior && parameter.required
        ? getRequiredActionIcon()
        : getOptionalActionIcon();

    if (!icon) {
      // This is required to keep input width constant
      return <WidgetStatus className={S.widgetStatus} status="none" />;
    }

    return icon;
  };

  const resetToDefault = () => {
    const { required, default: defaultValue } = parameter;

    if (required && defaultValue != null && !value) {
      setValue(defaultValue);
    }
  };

  const onFocusChanged = (isFocused: boolean) => {
    focusChanged?.(isFocused);
    setIsFocused(isFocused);

    if (enableRequiredBehavior && !isFocused) {
      resetToDefault();
    }
  };

  const typeIcon = useMemo(() => {
    const showTypeIcon = !isEditing && !isFocused && !(hasValue && noPopover);
    return showTypeIcon ? (
      <Icon name={parameterTypeIcon} className={S.parameterIcon} size={16} />
    ) : null;
  }, [hasValue, isEditing, isFocused, noPopover, parameterTypeIcon]);

  if (noPopover) {
    return (
      <Sortable
        id={parameter.id}
        draggingStyle={{ opacity: 0.5 }}
        disabled={!isSortable}
        role="listitem"
      >
        <ParameterValueWidgetTrigger
          className={cx(S.noPopover, className)}
          ariaLabel={parameter.name}
          hasValue={hasValue}
        >
          {typeIcon}
          <div className={S.Prefix}>{prefix}</div>
          <ParameterDropdownWidget
            parameter={parameter}
            parameters={parameters}
            question={question}
            dashboard={dashboard}
            value={value}
            setValue={setValue}
            isEditing={isEditing}
            placeholder={placeholder}
            focusChanged={setIsFocused}
            isFullscreen={isFullscreen}
            commitImmediately={commitImmediately}
            setParameterValueToDefault={setParameterValueToDefault}
            enableRequiredBehavior={enableRequiredBehavior}
            isSortable={isSortable}
            onFocusChanged={onFocusChanged}
          />
          {getActionIcon()}
        </ParameterValueWidgetTrigger>
      </Sortable>
    );
  }

  const translatedPlaceholder = tc(placeholder);

  const placeholderText = isEditing
    ? isDateParameter(parameter)
      ? t`Select a default value…`
      : t`Enter a default value…`
    : translatedPlaceholder || t`Select…`;

  return (
    <Popover
      opened={isOpen}
      onChange={toggle}
      position="bottom-start"
      trapFocus
      {...popoverProps}
    >
      <Popover.Target>
        <Box
          data-testid="parameter-value-widget-target"
          onClick={toggle}
          className={CS.cursorPointer}
        >
          <Sortable
            id={parameter.id}
            draggingStyle={{ opacity: 0.5 }}
            disabled={!isSortable}
            role="listitem"
          >
            <ParameterValueWidgetTrigger
              hasValue={hasValue}
              className={className}
              ariaLabel={placeholder}
              mimicMantine={mimicMantine}
            >
              {typeIcon}
              {prefix && <div className={S.Prefix}>{prefix}</div>}
              <div
                className={CS.mr1}
                style={
                  isStringParameter(parameter) ? { maxWidth: "190px" } : {}
                }
              >
                <FormattedParameterValue
                  parameter={parameter}
                  value={value}
                  cardId={question?.id()}
                  dashboardId={dashboard?.id}
                  placeholder={placeholderText}
                  isPopoverOpen={isOpen}
                />
              </div>
              {getActionIcon()}
            </ParameterValueWidgetTrigger>
          </Sortable>
        </Box>
      </Popover.Target>
      <Popover.Dropdown
        // Removes `maxWidth` so that `floating-ui` can detect the new element size. See metabase#52918 for details.
        // Use `size` middleware options when we upgrade to mantine v7.
        maw={isDateParameter(parameter) ? "100vw !important" : undefined}
        data-testid="parameter-value-dropdown"
      >
        <ParameterDropdownWidget
          parameter={parameter}
          parameters={parameters}
          question={question}
          dashboard={dashboard}
          value={value}
          setValue={setValue}
          isEditing={isEditing}
          placeholder={placeholder}
          focusChanged={setIsFocused}
          isFullscreen={isFullscreen}
          commitImmediately={commitImmediately}
          setParameterValueToDefault={setParameterValueToDefault}
          enableRequiredBehavior={enableRequiredBehavior}
          isSortable={isSortable}
          onFocusChanged={onFocusChanged}
          onPopoverClose={close}
        />
      </Popover.Dropdown>
    </Popover>
  );
};

function hasNoPopover(parameter: UiParameter) {
  // This is needed because isTextWidget check isn't complete,
  // and returns true for dates too.
  if (
    isDateParameter(parameter) ||
    isTemporalUnitParameter(parameter) ||
    isBooleanParameter(parameter)
  ) {
    return false;
  }
  return isTextWidget(parameter);
}

function wrapArray<T>(value: T | T[]): T[] {
  if (Array.isArray(value)) {
    return value;
  }
  return [value];
}
