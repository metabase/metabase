import cx from "classnames";
import { type PropsWithChildren, type ReactNode, useState } from "react";

import { FieldSet } from "metabase/components/FieldSet";
import { Sortable } from "metabase/core/components/Sortable";
import CS from "metabase/css/core/index.css";
import DashboardS from "metabase/css/dashboard.module.css";
import type { DashboardFullscreenControls } from "metabase/dashboard/types";
import EmbedFrameS from "metabase/public/components/EmbedFrame/EmbedFrame.module.css";
import { Box, Flex, Icon } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type { Dashboard, Parameter, ParameterId } from "metabase-types/api";

import { ParameterValueWidget } from "../ParameterValueWidget";

import S from "./ParameterWidget.module.css";

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
      <Flex
        align="center"
        miw="170px"
        p="sm"
        fw="bold"
        className={cx(S.ParameterContainer, {
          [S.isEditingParameter]: isEditingParameter,
        })}
        onClick={() =>
          setEditingParameter?.(isEditingParameter ? null : parameter.id)
        }
      >
        <div className={CS.mr1} onClick={e => e.stopPropagation()}>
          {dragHandle}
        </div>
        {parameter.name}
        <Icon ml="auto" pl="md" name="gear" />
      </Flex>
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
        <FieldSet
          className={cx(
            className,
            DashboardS.ParameterFieldSet,
            EmbedFrameS.ParameterFieldSet,
            S.ParameterFieldSet,
            {
              [S.fieldHasValueOrFocus]: fieldHasValueOrFocus,
            },
          )}
          legend={legend}
          required={enableParameterRequiredBehavior && parameter.required}
          noPadding
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
        </FieldSet>
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
