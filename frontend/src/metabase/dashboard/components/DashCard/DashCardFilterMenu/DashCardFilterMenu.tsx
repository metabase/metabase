import cx from "classnames";
import { type MouseEvent, useMemo, useState } from "react";
import { t } from "ttag";

import {
  setEditingParameter,
  setParameterValue,
} from "metabase/dashboard/actions";
import { useDashboardContext } from "metabase/dashboard/context";
import { ParameterDropdownWidget } from "metabase/parameters/components/ParameterDropdownWidget";
import { getParameterIconName } from "metabase/parameters/utils/ui";
import { useDispatch } from "metabase/redux";
import { Box, Icon, Menu, Text, Tooltip, UnstyledButton } from "metabase/ui";
import { SAVING_DOM_IMAGE_HIDDEN_CLASS } from "metabase/visualizations/lib/save-chart-image";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import { getValuePopulatedParameters } from "metabase-lib/v1/parameters/utils/parameter-values";
import type { ParameterId } from "metabase-types/api";

import S from "./DashCardFilterMenu.module.css";

const LIST_WIDTH = 256;
const WIDGET_WIDTH = 380;

interface DashCardFilterMenuProps {
  parameters: UiParameter[];
}

export function DashCardFilterMenu({ parameters }: DashCardFilterMenuProps) {
  const dispatch = useDispatch();
  const { isEditing } = useDashboardContext();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedParameterId, setSelectedParameterId] =
    useState<ParameterId | null>(null);

  const selectedParameter = parameters.find(
    (parameter) => parameter.id === selectedParameterId,
  );
  const activeCount = parameters.filter(
    (parameter) => parameter.value != null,
  ).length;

  const handleOpenChange = (nextIsOpen: boolean) => {
    setIsOpen(nextIsOpen);
    if (!nextIsOpen) {
      setSelectedParameterId(null);
    }
  };

  // While editing the dashboard, a filter opens its settings sidebar instead
  // of its value picker, like the filter widgets elsewhere on the dashboard.
  const handleSelectParameter = (parameterId: ParameterId) => {
    if (isEditing) {
      dispatch(setEditingParameter(parameterId));
      handleOpenChange(false);
    } else {
      setSelectedParameterId(parameterId);
    }
  };

  return (
    <Menu
      opened={isOpen}
      onChange={handleOpenChange}
      position="bottom-start"
      closeOnItemClick={false}
    >
      <Menu.Target>
        <Tooltip label={t`Show filters`}>
          <UnstyledButton
            className={cx(S.trigger, SAVING_DOM_IMAGE_HIDDEN_CLASS)}
            aria-label={t`Show filters`}
            data-active={activeCount > 0 || undefined}
            data-testid="show-filter-parameter-button"
            onMouseDown={stopDragging}
          >
            <Icon name="filter" size={12} />
            {activeCount > 0 && (
              <Text
                component="span"
                fz={11}
                lh={1}
                fw={700}
                c="inherit"
                data-testid="show-filter-parameter-count"
              >
                {activeCount}
              </Text>
            )}
          </UnstyledButton>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown
        className={S.dropdown}
        data-testid="show-filter-parameter-dropdown"
        onMouseDown={stopDragging}
      >
        {selectedParameter ? (
          <FilterWidget
            parameter={selectedParameter}
            onBack={() => setSelectedParameterId(null)}
            onClose={() => handleOpenChange(false)}
          />
        ) : (
          <Box miw={LIST_WIDTH}>
            {parameters.map((parameter) => (
              <Menu.Item
                key={parameter.id}
                leftSection={<Icon name={getParameterIconName(parameter)} />}
                rightSection={<Icon name="chevronright" />}
                onClick={() => handleSelectParameter(parameter.id)}
              >
                {parameter.name}
              </Menu.Item>
            ))}
          </Box>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}

interface FilterWidgetProps {
  parameter: UiParameter;
  onBack: () => void;
  onClose: () => void;
}

function FilterWidget({ parameter, onBack, onClose }: FilterWidgetProps) {
  const dispatch = useDispatch();
  const {
    dashboard,
    parameters: dashboardParameters,
    parameterValues,
  } = useDashboardContext();

  const linkedFilterParameters = useMemo(
    () =>
      getValuePopulatedParameters({
        parameters: dashboardParameters,
        values: parameterValues,
      }),
    [dashboardParameters, parameterValues],
  );

  return (
    <Box w={WIDGET_WIDTH} maw="100%">
      <UnstyledButton className={S.backButton} p="md" onClick={onBack}>
        <Icon name="chevronleft" size={12} />
        <Text component="span" fw={700} c="inherit">
          {parameter.name}
        </Text>
      </UnstyledButton>
      <ParameterDropdownWidget
        parameter={parameter}
        parameters={linkedFilterParameters}
        value={parameter.value}
        dashboardId={dashboard?.id}
        enableRequiredBehavior
        setValue={(value) => dispatch(setParameterValue(parameter.id, value))}
        onFocusChanged={() => undefined}
        onPopoverClose={onClose}
      />
    </Box>
  );
}

function stopDragging(event: MouseEvent) {
  event.stopPropagation();
}
