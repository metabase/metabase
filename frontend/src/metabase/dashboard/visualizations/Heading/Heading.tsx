import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import type { JSX, MouseEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { useTranslateContent } from "metabase/content-translation/hooks";
import CS from "metabase/css/core/index.css";
import DashboardS from "metabase/css/dashboard.module.css";
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
import { fillParametersInText } from "metabase/dashboard/visualizations/parameter-substitution";
import { useSelector } from "metabase/redux";
import { getSetting } from "metabase/settings";
import { Box, Ellipsified, Flex } from "metabase/ui";
import { measureTextWidth } from "metabase/utils/measure-text";
import { isEmpty } from "metabase/utils/validate";
import type {
  Dashboard,
  VirtualDashboardCard,
  VisualizationSettings,
} from "metabase-types/api";

import S from "./Heading.module.css";

const HEADING_FONT_SIZE = "1.375rem";
const HEADING_FONT_WEIGHT = 700;

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
  const preventDragging = (e: MouseEvent) => {
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
      <Box className={CS.overflowHidden} h="100%">
        {hasVariables ? (
          <DashCardParameterMapper
            compact
            dashcard={dashcard}
            isMobile={isMobile}
          />
        ) : (
          <Flex h="100%" align="center">
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
      <Box
        component="input"
        className={cx(S.input, CS.textEllipsis)}
        name="heading"
        data-testid="editing-dashboard-heading-input"
        placeholder={placeholder}
        value={textValue}
        autoFocus={justAdded || isFocused}
        flex={1}
        w="100%"
        mah="100%"
        p={0}
        my="xxs"
        c="text-primary"
        fz={HEADING_FONT_SIZE}
        fw={HEADING_FONT_WEIGHT}
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
      <Flex
        className={cx(
          S.root,
          DashboardS.DashCardEditOutline,
          CS.overflowHidden,
          {
            [S.borderAdjusted]: !isPreviewing || !hasContent,
            [S.empty]: !hasContent,
          },
        )}
        data-testid="editing-dashboard-heading-container"
        w="100%"
        h="100%"
        justify="space-between"
        align="center"
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
      </Flex>
    );
  }

  return (
    <Flex
      className={CS.overflowHidden}
      w="100%"
      h="100%"
      align="center"
      justify="space-between"
      pl="md"
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

type HeadingContentProps = {
  children: React.ReactNode;
  hasFilters: boolean;
  isEditing?: boolean;
  onMouseDown?: (event: MouseEvent) => void;
  "data-testid": string;
};

function HeadingContent({
  children,
  hasFilters,
  isEditing,
  ...props
}: HeadingContentProps) {
  return (
    <Box
      component="h2"
      className={cx(S.content, {
        [S.editing]: isEditing,
        [CS.textNoWrap]: hasFilters,
        [CS.textEllipsis]: hasFilters,
      })}
      flex={1}
      mah="100%"
      fz={HEADING_FONT_SIZE}
      fw={HEADING_FONT_WEIGHT}
      p={0}
      my="xxs"
      {...props}
    >
      {children}
    </Box>
  );
}
