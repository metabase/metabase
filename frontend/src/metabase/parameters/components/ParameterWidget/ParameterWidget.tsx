import cx from "classnames";
import {
  type PropsWithChildren,
  type ReactNode,
  useMemo,
  useState,
} from "react";

import { FieldSet } from "metabase/common/components/FieldSet";
import { Sortable } from "metabase/common/components/Sortable";
import CS from "metabase/css/core/index.css";
import DashboardS from "metabase/css/dashboard.module.css";
import type { DashboardFullscreenControls } from "metabase/dashboard/types";
import { useTranslateContent } from "metabase/i18n/hooks";
import EmbedFrameS from "metabase/public/components/EmbedFrame/EmbedFrame.module.css";
import { Box, Flex, Icon } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type { Dashboard, Parameter, ParameterId } from "metabase-types/api";

import { ParameterValueWidget } from "../ParameterValueWidget";

import S from "./ParameterWidget.module.css";

export type ParameterWidgetProps = PropsWithChildren<
  {
    parameter: UiParameter;
  } & Partial<
    {
      setValue: (value: any) => void;
      question: Question;
      dashboard: Dashboard | null;

      editingParameter: Parameter | null;
      commitImmediately: boolean;
      parameters: UiParameter[];
      setParameterValueToDefault: (parameterId: ParameterId) => void;
      enableParameterRequiredBehavior: boolean;
      isSortable: boolean;
      isEditing: boolean;
      className: string;
      isFullscreen: boolean;
      setEditingParameter: (parameterId: ParameterId | null) => void;
      dragHandle: ReactNode;
      variant?: "default" | "subtle";
      withinPortal?: boolean;
      fullWidth?: boolean;
      hasTestId?: boolean;
      popoverPosition: "bottom-start" | "bottom-end";
    } & Pick<DashboardFullscreenControls, "isFullscreen">
  >
>;

export const ParameterWidget = ({
  question,
  dashboard,
  parameter,
  editingParameter,
  commitImmediately = false,
  parameters,
  setParameterValueToDefault,
  enableParameterRequiredBehavior,
  isSortable = false,
  isEditing,
  className,
  isFullscreen,
  setEditingParameter,
  setValue,
  children,
  dragHandle,
  variant = "default",
  withinPortal,
  popoverPosition = "bottom-start",
  fullWidth,
  hasTestId = true,
}: ParameterWidgetProps) => {
  const [isFocused, setIsFocused] = useState(false);
  const isEditingParameter = editingParameter?.id === parameter.id;
  const fieldHasValueOrFocus = parameter.value != null || isFocused;

  const tc = useTranslateContent();
  const maybeTranslatedParameterName = tc(parameter.name);

  const legend = fieldHasValueOrFocus ? maybeTranslatedParameterName : "";

  const popoverOffset = useMemo(() => {
    const crossAxisOffset = variant === "default" ? 16 : 0;
    const mainAxis = variant === "default" ? 8 : 4;
    return {
      mainAxis,
      crossAxis:
        popoverPosition === "bottom-start" ? -crossAxisOffset : crossAxisOffset,
    };
  }, [popoverPosition, variant]);

  if (isEditing && setEditingParameter) {
    return (
      <Sortable
        id={parameter.id}
        draggingStyle={{ opacity: 0.5 }}
        disabled={!isEditing}
        role="listitem"
      >
        <Flex
          align="center"
          miw="170px"
          p="sm"
          fw="bold"
          className={cx(S.EditingParameterContainer, {
            [S.isEditingParameter]: isEditingParameter,
            [S[variant]]: variant,
          })}
          onClick={() =>
            setEditingParameter?.(isEditingParameter ? null : parameter.id)
          }
          data-testid={hasTestId ? "editing-parameter-widget" : undefined}
        >
          <div className={CS.mr1} onClick={(e) => e.stopPropagation()}>
            {dragHandle}
          </div>
          {parameter.name}
          <Icon ml="auto" pl="md" name="gear" />
        </Flex>
      </Sortable>
    );
  }

  if (variant === "subtle") {
    return (
      <Flex
        data-testid={hasTestId ? "parameter-widget" : undefined}
        fz={isFullscreen ? "md" : undefined}
        align="center"
        className={cx(className, S.SubtleParameterWidget, {
          [S.fullWidth]: fullWidth,
        })}
      >
        <ParameterValueWidget
          parameter={parameter}
          parameters={parameters}
          question={question}
          dashboard={dashboard}
          value={parameter.value}
          setValue={(value) => setValue?.(value)}
          isEditing={isEditingParameter}
          placeholder={parameter.name}
          focusChanged={setIsFocused}
          isFullscreen={isFullscreen}
          commitImmediately={commitImmediately}
          setParameterValueToDefault={setParameterValueToDefault}
          enableRequiredBehavior={enableParameterRequiredBehavior}
          isSortable={isSortable && isEditing}
          variant={variant}
          withinPortal={withinPortal}
          prefix={legend ? legend + ":\u00a0" : undefined}
          offset={popoverOffset}
          position={popoverPosition}
        />
        {children}
      </Flex>
    );
  }

  return (
    <Box
      fz={isFullscreen ? "md" : undefined}
      data-testid={hasTestId ? "parameter-widget" : undefined}
    >
      <FieldSet
        className={cx(
          className,
          DashboardS.ParameterFieldSet,
          EmbedFrameS.ParameterFieldSet,
          S.ParameterFieldSet,

          {
            [S.fieldHasValueOrFocus]: fieldHasValueOrFocus,
            [S[variant]]: variant,
          },
        )}
        legend={legend}
        required={enableParameterRequiredBehavior && parameter.required}
        noPadding
      >
        <ParameterValueWidget
          parameter={parameter}
          parameters={parameters}
          question={question}
          dashboard={dashboard}
          value={parameter.value}
          setValue={(value) => setValue?.(value)}
          isEditing={isEditingParameter}
          placeholder={parameter.name}
          focusChanged={setIsFocused}
          isFullscreen={isFullscreen}
          commitImmediately={commitImmediately}
          setParameterValueToDefault={setParameterValueToDefault}
          enableRequiredBehavior={enableParameterRequiredBehavior}
          isSortable={isSortable && isEditing}
          variant={variant}
          withinPortal={withinPortal}
          offset={popoverOffset}
          position={popoverPosition}
        />
        {children}
      </FieldSet>
    </Box>
  );
};
