import cx from "classnames";
import { type PropsWithChildren, type ReactNode, useState } from "react";

import { Sortable } from "metabase/core/components/Sortable";
import CS from "metabase/css/core/index.css";
import TransitionS from "metabase/css/core/transitions.module.css";
import type { DashboardFullscreenControls } from "metabase/dashboard/types";
import { Box } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type { Dashboard, Parameter, ParameterId } from "metabase-types/api";

import { ParameterValueWidget } from "../ParameterValueWidget";

import {
  ParameterContainer,
  ParameterFieldSet,
  SettingsIcon,
} from "./ParameterWidget.styled";

type ParameterWidgetProps = PropsWithChildren<
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
    } & Pick<DashboardFullscreenControls, "isFullscreen">
  >
>;

const EditParameterWidget = ({
  dragHandle,
  isEditing,
  parameter,
  setEditingParameter,
  isEditingParameter,
}: {
  isEditingParameter: boolean;
} & Pick<
  ParameterWidgetProps,
  "parameter" | "setEditingParameter" | "isEditing" | "dragHandle"
>) => {
  return (
    <Sortable
      id={parameter.id}
      draggingStyle={{ opacity: 0.5 }}
      disabled={!isEditing}
      role="listitem"
    >
      <ParameterContainer
        isEditingParameter={isEditingParameter}
        onClick={() =>
          setEditingParameter?.(isEditingParameter ? null : parameter.id)
        }
      >
        <div className={CS.mr1} onClick={e => e.stopPropagation()}>
          {dragHandle}
        </div>
        {parameter.name}
        <SettingsIcon name="gear" size={16} />
      </ParameterContainer>
    </Sortable>
  );
};

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
}: ParameterWidgetProps) => {
  const [isFocused, setIsFocused] = useState(false);
  const isEditingParameter = editingParameter?.id === parameter.id;
  const fieldHasValueOrFocus = parameter.value != null || isFocused;
  const legend = fieldHasValueOrFocus ? parameter.name : "";

  if (!isEditing || !setEditingParameter) {
    return (
      <Box fz={isFullscreen ? "md" : undefined}>
        <ParameterFieldSet
          className={cx(className, {
            [TransitionS.transitionThemeChange]: isFullscreen,
          })}
          legend={legend}
          required={enableParameterRequiredBehavior && parameter.required}
          noPadding={true}
          fieldHasValueOrFocus={fieldHasValueOrFocus}
        >
          <ParameterValueWidget
            offset={{
              mainAxis: 8,
              crossAxis: -16,
            }}
            parameter={parameter}
            parameters={parameters}
            question={question}
            dashboard={dashboard}
            value={parameter.value}
            setValue={value => setValue?.(value)}
            isEditing={isEditingParameter}
            placeholder={parameter.name}
            focusChanged={setIsFocused}
            isFullscreen={isFullscreen}
            commitImmediately={commitImmediately}
            setParameterValueToDefault={setParameterValueToDefault}
            enableRequiredBehavior={enableParameterRequiredBehavior}
            isSortable={isSortable && isEditing}
          />
          {children}
        </ParameterFieldSet>
      </Box>
    );
  }

  return (
    <EditParameterWidget
      isEditingParameter={isEditingParameter}
      parameter={parameter}
      setEditingParameter={setEditingParameter}
      isEditing={isEditing}
      dragHandle={dragHandle}
    />
  );
};
