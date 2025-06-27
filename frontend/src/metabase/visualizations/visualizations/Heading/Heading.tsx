import { useDisclosure } from "@mantine/hooks";
import type { ComponentProps, MouseEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { DashCardParameterMapper } from "metabase/dashboard/components/DashCard/DashCardParameterMapper/DashCardParameterMapper";
import { DashboardParameterList } from "metabase/dashboard/components/DashboardParameterList";
import { useDashboardContext } from "metabase/dashboard/context";
import {
  getDashCardInlineValuePopulatedParameters,
  getDashcardParameterMappingOptions,
  getIsEditingParameter,
  getParameterValues,
} from "metabase/dashboard/selectors";
import { useTranslateContent } from "metabase/i18n/hooks";
import { useSelector } from "metabase/lib/redux";
import resizeObserver from "metabase/lib/resize-observer";
import { isEmpty } from "metabase/lib/validate";
import { Flex, Icon, Menu } from "metabase/ui";
import { fillParametersInText } from "metabase/visualizations/shared/utils/parameter-substitution";
import type {
  Dashboard,
  VirtualDashboardCard,
  VisualizationSettings,
} from "metabase-types/api";

import {
  HeadingContent,
  HeadingTextInput,
  InputContainer,
} from "./Heading.styled";

interface HeadingProps {
  isMobile: boolean;
  onUpdateVisualizationSettings: ({ text }: { text: string }) => void;
  dashcard: VirtualDashboardCard;
  settings: VisualizationSettings;
  dashboard: Dashboard;
  gridSize: {
    width: number;
    height: number;
  };
}

export function Heading({
  dashboard,
  dashcard,
  settings,
  gridSize,
  onUpdateVisualizationSettings,
  isMobile,
}: HeadingProps) {
  const { isEditing } = useDashboardContext();

  const inlineParameters = useSelector((state) =>
    getDashCardInlineValuePopulatedParameters(state, dashcard?.id),
  );
  const parameterValues = useSelector(getParameterValues);

  const justAdded = useMemo(() => dashcard?.justAdded || false, [dashcard]);

  const tc = useTranslateContent();
  const isShort = gridSize.height < 2;

  const [isFocused, { open: toggleFocusOn, close: toggleFocusOff }] =
    useDisclosure(justAdded);
  const isPreviewing = !isFocused;

  const [textValue, setTextValue] = useState(settings.text);
  const preventDragging = (e: MouseEvent<HTMLInputElement>) => {
    e.stopPropagation();
  };

  const isEditingParameter = useSelector(getIsEditingParameter);

  const mappingOptions = useSelector((state) =>
    getDashcardParameterMappingOptions(state, {
      card: dashcard.card,
      dashcard,
    }),
  );
  const hasVariables = mappingOptions.length > 0;

  const container = useRef<HTMLDivElement>(null);
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    const element = container.current;
    if (!element) {
      return;
    }

    const handleResize = () => {
      if (!container.current) {
        return;
      }

      setIsNarrow(container.current.getBoundingClientRect().width < 600);
    };

    resizeObserver.subscribe(element, handleResize);
    return () => {
      resizeObserver.unsubscribe(element, handleResize);
    };
  }, [isEditing]);

  const translatedText = useMemo(() => tc(settings.text), [settings.text, tc]);

  // handles a case when settings are updated externally
  useEffect(() => {
    setTextValue(settings.text);
  }, [settings.text]);

  const content = useMemo(
    () =>
      isEditing
        ? translatedText
        : fillParametersInText({
            dashcard,
            dashboard,
            parameterValues,
            text: translatedText,
          }),
    [dashcard, dashboard, parameterValues, translatedText, isEditing],
  );

  const hasContent = !isEmpty(settings.text);
  const placeholder = t`You can connect widgets to {{variables}} in heading cards.`;

  let leftContent: JSX.Element | null;

  if (hasVariables && isEditingParameter) {
    leftContent = (
      <DashCardParameterMapper dashcard={dashcard} isMobile={isMobile} />
    );
  } else if (isPreviewing) {
    leftContent = (
      <HeadingContent
        data-testid="editing-dashboard-heading-preview"
        isEditing={isEditing}
        onMouseDown={preventDragging}
        hasFilters={inlineParameters.length > 0}
      >
        {hasContent ? content : placeholder}
      </HeadingContent>
    );
  } else {
    leftContent = (
      <HeadingTextInput
        name="heading"
        data-testid="editing-dashboard-heading-input"
        placeholder={placeholder}
        value={textValue}
        autoFocus={justAdded || isFocused}
        onChange={(e) => setTextValue(e.target.value)}
        onMouseDown={preventDragging}
        onBlur={() => {
          toggleFocusOff();

          if (settings.text !== textValue) {
            onUpdateVisualizationSettings({ text: textValue });
          }
        }}
      />
    );
  }
  if (isEditing) {
    return (
      <InputContainer
        data-testid="editing-dashboard-heading-container"
        isEmpty={!hasContent}
        isPreviewing={isPreviewing}
        onClick={toggleFocusOn}
        ref={container}
        style={{
          paddingRight: isNarrow && isShort ? "2.5rem" : undefined,
        }}
      >
        {leftContent}
        {inlineParameters.length > 0 && (
          <ParametersList
            isNarrow={isNarrow}
            parameters={inlineParameters}
            widgetsVariant="subtle"
          />
        )}
      </InputContainer>
    );
  }

  return (
    <Flex
      w="100%"
      h="100%"
      align="center"
      justify="space-between"
      pl="0.75rem"
      style={{ overflow: "hidden" }}
      ref={container}
    >
      <HeadingContent
        data-testid="saved-dashboard-heading-content"
        hasFilters={inlineParameters.length > 0}
      >
        {content}
      </HeadingContent>
      {inlineParameters.length > 0 && (
        <ParametersList
          isNarrow={isNarrow}
          parameters={inlineParameters}
          widgetsVariant="subtle"
        />
      )}
    </Flex>
  );
}

interface ParametersListProps
  extends ComponentProps<typeof DashboardParameterList> {
  isNarrow: boolean;
}

function ParametersList(props: ParametersListProps) {
  const { isNarrow, ...rest } = props;

  const { editingParameter } = useDashboardContext();

  const parametersWithValues = useMemo(
    () => rest.parameters.filter((p) => p.value != null),
    [rest.parameters],
  );

  const parametersListCommonProps = {
    ...rest,
    widgetsVariant: "subtle" as const,
    isSortable: false,
  };

  if (isNarrow) {
    if (editingParameter) {
      const parameters = rest.parameters.filter(
        (p) => p.id === editingParameter.id,
      );
      // If a parameter is being edited, we don't show the dropdown
      return (
        <DashboardParameterList
          {...parametersListCommonProps}
          parameters={parameters}
        />
      );
    }

    return (
      <Menu>
        <Menu.Target data-testid="show-filter-parameter-button">
          <ToolbarButton
            aria-label={t`Show filters`}
            tooltipLabel={t`Show filters`}
            onClick={(e) => {
              // To avoid focusing the input when clicking the button
              e.stopPropagation();
            }}
          >
            <Icon name="filter" />
            {parametersWithValues.length > 0 && (
              <span data-testid="show-filter-parameter-count">
                &nbsp;{parametersWithValues.length}
              </span>
            )}
          </ToolbarButton>
        </Menu.Target>
        <Menu.Dropdown
          data-testid="show-filter-parameter-dropdown"
          style={{ overflow: "visible" }}
        >
          <DashboardParameterList
            {...parametersListCommonProps}
            widgetsWithinPortal={false}
            vertical
          />
        </Menu.Dropdown>
      </Menu>
    );
  }

  return <DashboardParameterList {...parametersListCommonProps} />;
}
