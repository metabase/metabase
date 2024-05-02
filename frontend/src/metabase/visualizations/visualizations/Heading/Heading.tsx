import type { MouseEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import {
  setEditingParameter,
  setParameterIndex,
  setParameterValue,
  setParameterValueToDefault,
} from "metabase/dashboard/actions";
import { getEditingParameter } from "metabase/dashboard/selectors";
import { useToggle } from "metabase/hooks/use-toggle";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { isEmpty } from "metabase/lib/validate";
import ParametersList from "metabase/parameters/components/ParametersList";
import { fillParametersInText } from "metabase/visualizations/shared/utils/parameter-substitution";
import type {
  Dashboard,
  ParameterValueOrArray,
  VisualizationSettings,
  VirtualDashboardCard,
  ParameterId,
} from "metabase-types/api";

import {
  InputContainer,
  HeadingContent,
  HeadingContainer,
  TextInput,
} from "./Heading.styled";

interface HeadingProps {
  dashcard: VirtualDashboardCard;
  dashboard: Dashboard;
  settings: VisualizationSettings;
  parameterValues: { [id: string]: ParameterValueOrArray };
  isEditing: boolean;
  isFullscreen: boolean;
  isNightMode: boolean;
  onUpdateVisualizationSettings: ({ text }: { text: string }) => void;
}

export function Heading({
  dashcard,
  dashboard,
  settings,
  parameterValues,
  isEditing,
  isFullscreen,
  isNightMode,
  onUpdateVisualizationSettings,
}: HeadingProps) {
  const dispatch = useDispatch();

  const editingParameter = useSelector(getEditingParameter);

  const justAdded = useMemo(() => dashcard?.justAdded || false, [dashcard]);

  const [isFocused, { turnOn: toggleFocusOn, turnOff: toggleFocusOff }] =
    useToggle(justAdded);
  const isPreviewing = !isFocused;

  const [textValue, setTextValue] = useState(settings.text);
  const preventDragging = (e: MouseEvent<HTMLInputElement>) =>
    e.stopPropagation();

  // handles a case when settings are updated externally
  useEffect(() => {
    setTextValue(settings.text);
  }, [settings.text]);

  const content = useMemo(
    () =>
      fillParametersInText({
        dashcard,
        dashboard,
        parameterValues,
        text: settings.text,
      }),
    [dashcard, dashboard, parameterValues, settings.text],
  );

  const parameters = dashboard.parameters
    ?.filter(parameter =>
      dashcard.visualization_settings.parameter_ids?.includes(parameter.id),
    )
    .map(parameter => ({
      ...parameter,
      value: parameterValues[parameter.id],
    }));

  const hasContent = !isEmpty(settings.text);
  const placeholder = t`Heading`;

  const handleParameterValueChange = (parameterId: ParameterId, value: any) => {
    dispatch(setParameterValue(parameterId, value));
  };

  const handleParameterIndexChange = (
    parameterId: ParameterId,
    index: number,
  ) => {
    dispatch(setParameterIndex(parameterId, index));
  };

  const handleChangeEditingParameter = (parameterId: ParameterId) => {
    dispatch(setEditingParameter(parameterId));
  };

  const handleSetParameterValueToDefault = (parameterId: ParameterId) => {
    dispatch(setParameterValueToDefault(parameterId));
  };

  if (isEditing) {
    return (
      <InputContainer
        data-testid="editing-dashboard-heading-container"
        isEmpty={!hasContent}
        isPreviewing={isPreviewing}
        onClick={toggleFocusOn}
      >
        <div>
          {isPreviewing ? (
            <HeadingContent
              data-testid="editing-dashboard-heading-preview"
              isEditing={isEditing}
              onMouseDown={preventDragging}
            >
              {hasContent ? settings.text : placeholder}
            </HeadingContent>
          ) : (
            <TextInput
              name="heading"
              data-testid="editing-dashboard-heading-input"
              placeholder={placeholder}
              value={textValue}
              autoFocus={justAdded || isFocused}
              onChange={e => setTextValue(e.target.value)}
              onMouseDown={preventDragging}
              onBlur={() => {
                toggleFocusOff();

                if (settings.text !== textValue) {
                  onUpdateVisualizationSettings({ text: textValue });
                }
              }}
            />
          )}
        </div>
        <div
          style={{ zIndex: 999 }}
          onClick={e => e.stopPropagation()}
          onDragStart={e => e.stopPropagation()}
        >
          <ParametersList
            parameters={parameters}
            dashboard={dashboard}
            editingParameter={editingParameter}
            isFullscreen={isFullscreen}
            isNightMode={isNightMode}
            isEditing={isEditing}
            setParameterIndex={handleParameterIndexChange}
            setParameterValue={handleParameterValueChange}
            setEditingParameter={handleChangeEditingParameter}
            setParameterValueToDefault={handleSetParameterValueToDefault}
            enableParameterRequiredBehavior
          />
        </div>
      </InputContainer>
    );
  }

  return (
    <HeadingContainer>
      <HeadingContent data-testid="saved-dashboard-heading-content">
        {content}
      </HeadingContent>
      <div
        style={{ zIndex: 999 }}
        onClick={e => e.stopPropagation()}
        onDragStart={e => e.stopPropagation()}
      >
        <ParametersList
          parameters={parameters}
          dashboard={dashboard}
          editingParameter={editingParameter}
          isFullscreen={isFullscreen}
          isNightMode={isNightMode}
          isEditing={isEditing}
          setParameterIndex={handleParameterIndexChange}
          setParameterValue={handleParameterValueChange}
          setEditingParameter={handleChangeEditingParameter}
          setParameterValueToDefault={handleSetParameterValueToDefault}
          enableParameterRequiredBehavior
        />
      </div>
    </HeadingContainer>
  );
}
