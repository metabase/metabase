import cx from "classnames";
import { useState } from "react";
import { t } from "ttag";

import { useTranslateContent } from "metabase/content-translation/hooks";
import {
  setEditingParameter,
  setParameterValue,
  setParameterValueToDefault,
} from "metabase/dashboard/actions";
import { useDashboardContext } from "metabase/dashboard/context";
import { useLinkedFilterParameters } from "metabase/dashboard/hooks";
import { ParameterDropdownWidget } from "metabase/parameters/components/ParameterDropdownWidget";
import { WidgetStatus } from "metabase/parameters/components/WidgetStatus";
import {
  getParameterIconName,
  getParametersWithValues,
  getVisibleParameters,
} from "metabase/parameters/utils/ui";
import { useDispatch } from "metabase/redux";
import {
  Box,
  Flex,
  Icon,
  Menu,
  Text,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import { SAVING_DOM_IMAGE_HIDDEN_CLASS } from "metabase/visualizations/lib/save-chart-image";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import { isDateParameter } from "metabase-lib/v1/parameters/utils/parameter-type";
import {
  areParameterValuesIdentical,
  parameterHasNoDisplayValue,
} from "metabase-lib/v1/parameters/utils/parameter-values";
import type { ParameterId } from "metabase-types/api";

import { preventDragOrInputFocus } from "../utils";

import S from "./DashCardFilterMenu.module.css";

const LIST_WIDTH = 256;
const WIDGET_MIN_WIDTH = 380;

interface DashCardFilterMenuProps {
  parameters: UiParameter[];
}

export function DashCardFilterMenu({
  parameters: allParameters,
}: DashCardFilterMenuProps) {
  const dispatch = useDispatch();
  const tc = useTranslateContent();
  const { isEditing, hideParameters } = useDashboardContext();
  const parameters = getVisibleParameters(allParameters, hideParameters);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedParameterId, setSelectedParameterId] =
    useState<ParameterId | null>(null);

  const selectedParameter = parameters.find(
    (parameter) => parameter.id === selectedParameterId,
  );
  const activeCount = getParametersWithValues(parameters).length;

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

  if (parameters.length === 0) {
    return null;
  }

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
            onMouseDown={preventDragOrInputFocus}
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
        // The dropdown keeps the max-width measured for the filter list, which
        // would clip a double calendar (metabase#52918).
        maw={
          selectedParameter && isDateParameter(selectedParameter)
            ? "100vw !important"
            : undefined
        }
        data-testid="show-filter-parameter-dropdown"
        onMouseDown={preventDragOrInputFocus}
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
                {tc(parameter.name)}
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
  const tc = useTranslateContent();
  const { dashboard } = useDashboardContext();
  const linkedFilterParameters = useLinkedFilterParameters();

  const status = getValueStatus(parameter);

  return (
    <Box miw={WIDGET_MIN_WIDTH}>
      <Flex align="center" pr="md">
        <UnstyledButton className={S.backButton} p="md" onClick={onBack}>
          <Icon name="chevronleft" size={12} />
          <Text component="span" fw={700} c="inherit">
            {tc(parameter.name)}
          </Text>
        </UnstyledButton>
        {status && (
          <WidgetStatus
            status={status}
            highlighted
            onClick={() => {
              if (status === "reset") {
                dispatch(setParameterValueToDefault(parameter.id));
              } else {
                dispatch(setParameterValue(parameter.id, null));
              }
              onClose();
            }}
          />
        )}
      </Flex>
      <ParameterDropdownWidget
        parameter={parameter}
        parameters={linkedFilterParameters}
        value={parameter.value}
        dashboardId={dashboard?.id}
        enableRequiredBehavior
        setValue={(value) => {
          dispatch(setParameterValue(parameter.id, value));
          onClose();
        }}
        onFocusChanged={() => undefined}
        onPopoverClose={onClose}
      />
    </Box>
  );
}

// Same rules as the pill widget's action icon, with required behavior on.
function getValueStatus(parameter: UiParameter): "reset" | "clear" | null {
  const hasValue = !parameterHasNoDisplayValue(parameter.value);
  const hasDefault = !parameterHasNoDisplayValue(parameter.default);
  const wrap = (value: unknown) => (Array.isArray(value) ? value : [value]);

  if (
    hasDefault &&
    !areParameterValuesIdentical(wrap(parameter.value), wrap(parameter.default))
  ) {
    return "reset";
  }
  if (hasValue && !(parameter.required && hasDefault)) {
    return "clear";
  }
  return null;
}
