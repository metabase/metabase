import type { MouseEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { DashCardParameterMapper } from "metabase/dashboard/components/DashCard/DashCardParameterMapper/DashCardParameterMapper";
import { DashboardParameterList } from "metabase/dashboard/components/DashboardParameterList";
import {
  getDashCardInlineValuePopulatedParameters,
  getDashcardParameterMappingOptions,
  getIsEditingParameter,
  getParameterValues,
} from "metabase/dashboard/selectors";
import { useToggle } from "metabase/hooks/use-toggle";
import { useTranslateContent } from "metabase/i18n/hooks";
import { useSelector } from "metabase/lib/redux";
import { isEmpty } from "metabase/lib/validate";
import { Flex } from "metabase/ui";
import { fillParametersInText } from "metabase/visualizations/shared/utils/parameter-substitution";
import type {
  Dashboard,
  VirtualDashboardCard,
  VisualizationSettings,
} from "metabase-types/api";

import { HeadingContent, InputContainer, TextInput } from "./Heading.styled";

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
  isMobile,
  onUpdateVisualizationSettings,
}: HeadingProps) {
  const inlineParameters = useSelector((state) =>
    getDashCardInlineValuePopulatedParameters(state, dashcard?.id),
  );
  const parameterValues = useSelector(getParameterValues);
  const isEditingParameter = useSelector(getIsEditingParameter);

  const mappingOptions = useSelector((state) =>
    getDashcardParameterMappingOptions(state, {
      card: dashcard.card,
      dashcard,
    }),
  );
  const hasVariables = mappingOptions.length > 0;

  const justAdded = useMemo(() => dashcard?.justAdded || false, [dashcard]);

  const tc = useTranslateContent();

  const [isFocused, { turnOn: toggleFocusOn, turnOff: toggleFocusOff }] =
    useToggle(justAdded);
  const isPreviewing = !isFocused;

  const [textValue, setTextValue] = useState(settings.text);
  const preventDragging = (e: MouseEvent<HTMLInputElement>) =>
    e.stopPropagation();

  const translatedText = useMemo(() => tc(settings.text), [settings.text, tc]);

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
        text: translatedText,
      }),
    [dashcard, dashboard, parameterValues, translatedText],
  );

  const hasContent = !isEmpty(settings.text);
  const placeholder = t`You can connect widgets to {{variables}} in heading cards.`;

  if (isEditing) {
    return (
      <InputContainer
        data-testid="editing-dashboard-heading-container"
        isEmpty={!hasContent}
        isPreviewing={isPreviewing}
        onClick={toggleFocusOn}
      >
        {isEditingParameter && hasVariables ? (
          <DashCardParameterMapper dashcard={dashcard} isMobile={isMobile} />
        ) : isPreviewing ? (
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
            disabled={isEditingParameter}
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
          <Flex style={{ flex: "0 0 auto" }}>
            <DashboardParameterList
              parameters={inlineParameters}
              isSortable={false}
              isFullscreen={isFullscreen}
            />
          </Flex>
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
    >
      <HeadingContent data-testid="saved-dashboard-heading-content">
        {content}
      </HeadingContent>
      {inlineParameters.length > 0 && (
        <DashboardParameterList
          parameters={inlineParameters}
          isFullscreen={isFullscreen}
        />
      )}
    </Flex>
  );
}
