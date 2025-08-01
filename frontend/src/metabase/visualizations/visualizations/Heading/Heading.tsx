import { useDisclosure } from "@mantine/hooks";
import type { MouseEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { CollapsibleDashboardParameterList } from "metabase/dashboard/components/CollapsibleDashboardParameterList";
import { DashCardParameterMapper } from "metabase/dashboard/components/DashCard/DashCardParameterMapper/DashCardParameterMapper";
import { useDashboardContext } from "metabase/dashboard/context";
import { useResponsiveParameterList } from "metabase/dashboard/hooks/use-responsive-parameter-list";
import {
  getDashCardInlineValuePopulatedParameters,
  getDashcardParameterMappingOptions,
  getIsEditingParameter,
  getParameterValues,
} from "metabase/dashboard/selectors";
import { useTranslateContent } from "metabase/i18n/hooks";
import { measureTextWidth } from "metabase/lib/measure-text";
import { useSelector } from "metabase/lib/redux";
import { isEmpty } from "metabase/lib/validate";
import { getSetting } from "metabase/selectors/settings";
import { Box, Flex } from "metabase/ui";
import { fillParametersInText } from "metabase/visualizations/shared/utils/parameter-substitution";
import type {
  Dashboard,
  VirtualDashboardCard,
  VisualizationSettings,
} from "metabase-types/api";

import {
  HEADING_FONT_SIZE,
  HEADING_FONT_WEIGHT,
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

  const fontFamily = useSelector((state) =>
    getSetting(state, "application-font"),
  );

  const { shouldCollapseList, containerRef, parameterListRef } =
    useResponsiveParameterList({
      reservedWidth: measureTextWidth(content, {
        family: fontFamily,
        size: HEADING_FONT_SIZE,
        weight: HEADING_FONT_WEIGHT,
      }),
    });

  let leftContent: JSX.Element | null;

  if (isEditingParameter) {
    leftContent = (
      <Box h="100%" style={{ overflow: "hidden" }}>
        {hasVariables ? (
          <DashCardParameterMapper
            compact
            dashcard={dashcard}
            isMobile={isMobile}
          />
        ) : (
          <Flex h="100%" display="flex" align="center">
            <Ellipsified>{t`You can connect widgets to {{ variables }} in heading cards.`}</Ellipsified>
          </Flex>
        )}
      </Box>
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
        ref={containerRef}
        style={{
          paddingRight: shouldCollapseList && isShort ? "2.5rem" : undefined,
        }}
      >
        {leftContent}
        {inlineParameters.length > 0 && (
          <CollapsibleDashboardParameterList
            isCollapsed={shouldCollapseList}
            parameters={inlineParameters}
            ref={parameterListRef}
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
      ref={containerRef}
    >
      <HeadingContent
        data-testid="saved-dashboard-heading-content"
        hasFilters={inlineParameters.length > 0}
      >
        {content}
      </HeadingContent>
      {inlineParameters.length > 0 && (
        <CollapsibleDashboardParameterList
          isCollapsed={shouldCollapseList}
          parameters={inlineParameters}
          ref={parameterListRef}
        />
      )}
    </Flex>
  );
}
