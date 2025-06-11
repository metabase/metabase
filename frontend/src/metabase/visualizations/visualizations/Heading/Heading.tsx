import { useDisclosure } from "@mantine/hooks";
import type { MouseEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { DashboardParameterList } from "metabase/dashboard/components/DashboardParameterList";
import {
  getDashCardInlineValuePopulatedParameters,
  getParameterValues,
} from "metabase/dashboard/selectors";
import { useSelector } from "metabase/lib/redux";
import { isEmpty } from "metabase/lib/validate";
import { Flex } from "metabase/ui";
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
  isEditing: boolean;
  isFullscreen: boolean;
  isMobile: boolean;
  onUpdateVisualizationSettings: ({ text }: { text: string }) => void;
  dashcard: VirtualDashboardCard;
  settings: VisualizationSettings;
  dashboard: Dashboard;
}

export function Heading({
  dashboard,
  dashcard,
  settings,
  isEditing,
  isFullscreen,
  onUpdateVisualizationSettings,
}: HeadingProps) {
  const inlineParameters = useSelector((state) =>
    getDashCardInlineValuePopulatedParameters(state, dashcard?.id),
  );
  const parameterValues = useSelector(getParameterValues);

  const justAdded = useMemo(() => dashcard?.justAdded || false, [dashcard]);

  const [isFocused, { open: toggleFocusOn, close: toggleFocusOff }] =
    useDisclosure(justAdded);
  const isPreviewing = !isFocused;

  const [textValue, setTextValue] = useState(settings.text);
  const preventDragging = (e: MouseEvent<HTMLInputElement>) => {
    e.stopPropagation();
  };

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

  const hasContent = !isEmpty(settings.text);
  const placeholder = t`You can connect widgets to {{variables}} in heading cards`;

  if (isEditing) {
    return (
      <InputContainer
        data-testid="editing-dashboard-heading-container"
        isEmpty={!hasContent}
        isPreviewing={isPreviewing}
        onClick={toggleFocusOn}
      >
        <Flex align="center" justify="space-between">
          {isPreviewing ? (
            <HeadingContent
              data-testid="editing-dashboard-heading-preview"
              isEditing={isEditing}
              onMouseDown={preventDragging}
            >
              {hasContent ? settings.text : placeholder}
            </HeadingContent>
          ) : (
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
          )}
          {inlineParameters.length > 0 && (
            <DashboardParameterList
              parameters={inlineParameters}
              isFullscreen={isFullscreen}
              widgetsVariant="subtle"
            />
          )}
        </Flex>
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
    >
      <HeadingContent data-testid="saved-dashboard-heading-content">
        {content}
      </HeadingContent>
      {inlineParameters.length > 0 && (
        <DashboardParameterList
          parameters={inlineParameters}
          isFullscreen={isFullscreen}
          widgetsVariant="subtle"
        />
      )}
    </Flex>
  );
}
