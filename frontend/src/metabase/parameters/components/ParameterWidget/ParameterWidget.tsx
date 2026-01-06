import cx from "classnames";
import {
  type PropsWithChildren,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePrevious } from "react-use";

import { Sortable } from "metabase/common/components/Sortable";
import CS from "metabase/css/core/index.css";
import type { DashboardFullscreenControls } from "metabase/dashboard/types";
import { useTranslateContent } from "metabase/i18n/hooks";
import { Box, Flex } from "metabase/ui";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type {
  CardId,
  DashboardId,
  Parameter,
  ParameterId,
} from "metabase-types/api";

import { ParameterValueWidget } from "../ParameterValueWidget";

import S from "./ParameterWidget.module.css";

export type ParameterWidgetProps = PropsWithChildren<
  {
    parameter: UiParameter;
  } & Partial<
    {
      setValue: (value: any) => void;
      cardId?: CardId;
      dashboardId?: DashboardId;

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
      withinPortal?: boolean;
      fullWidth?: boolean;
      hasTestId?: boolean;
      popoverPosition: "bottom-start" | "bottom-end";
    } & Pick<DashboardFullscreenControls, "isFullscreen">
  >
>;

export const ParameterWidget = ({
  cardId,
  dashboardId,
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
  withinPortal,
  popoverPosition = "bottom-start",
  fullWidth,
  hasTestId = true,
}: ParameterWidgetProps) => {
  const [isFocused, setIsFocused] = useState(false);
  const isEditingParameter = editingParameter?.id === parameter.id;
  const wasEditingParameter = usePrevious(isEditingParameter);
  const isEmptyValue = parameter.value == null || parameter.value === "";
  const fieldHasValueOrFocus = !isEmptyValue || isFocused;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!wasEditingParameter && isEditingParameter && element) {
      if (!isInViewport(element)) {
        element.scrollIntoView({ block: "center" });
      }
    }
  }, [isEditingParameter, wasEditingParameter]);

  const tc = useTranslateContent();
  const maybeTranslatedParameterName = tc(parameter.name);

  const legend = fieldHasValueOrFocus ? maybeTranslatedParameterName : "";

  const popoverOffset = useMemo(() => {
    const crossAxisOffset = 0;
    const mainAxis = 4;
    return {
      mainAxis,
      crossAxis:
        popoverPosition === "bottom-start" ? -crossAxisOffset : crossAxisOffset,
    };
  }, [popoverPosition]);

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
          miw="120px"
          p="sm"
          fw="bold"
          className={cx(S.EditingParameterContainer, {
            [S.isEditingParameter]: isEditingParameter,
          })}
          onClick={() =>
            setEditingParameter?.(isEditingParameter ? null : parameter.id)
          }
          data-testid={hasTestId ? "editing-parameter-widget" : undefined}
          ref={ref}
        >
          <Box mx="xs">{parameter.name}</Box>
          <Box ml="auto" onClick={(e) => e.stopPropagation()}>
            {dragHandle}
          </Box>
        </Flex>
      </Sortable>
    );
  }

  return (
    <Flex
      data-testid={hasTestId ? "parameter-widget" : undefined}
      fz={isFullscreen ? "md" : undefined}
      align="center"
      className={cx(className, {
        [CS.fullWidth]: fullWidth,
      })}
      ref={ref}
    >
      <ParameterValueWidget
        parameter={parameter}
        parameters={parameters}
        cardId={cardId}
        dashboardId={dashboardId}
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
        withinPortal={withinPortal}
        prefix={legend ? legend + ":\u00a0" : undefined}
        offset={popoverOffset}
        position={popoverPosition}
      />
      {children}
    </Flex>
  );
};

function isInViewport(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const viewportHeight =
    window.innerHeight ?? document.documentElement.clientHeight;
  const viewportWidth =
    window.innerWidth ?? document.documentElement.clientWidth;
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= viewportHeight &&
    rect.right <= viewportWidth
  );
}
