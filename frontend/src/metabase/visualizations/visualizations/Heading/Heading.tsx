import { useMemo, MouseEvent, useState } from "react";

import { t } from "ttag";

import { useToggle } from "metabase/hooks/use-toggle";
import { isEmpty } from "metabase/lib/validate";
import type {
  Dashboard,
  DashboardOrderedCard,
  ParameterValueOrArray,
  VisualizationSettings,
} from "metabase-types/api";

import { fillParametersInText } from "metabase/visualizations/shared/utils/parameter-substitution";

import {
  InputContainer,
  HeadingContent,
  HeadingContainer,
  TextInput,
} from "./Heading.styled";

interface HeadingProps {
  isEditing: boolean;
  onUpdateVisualizationSettings: ({ text }: { text: string }) => void;
  dashcard: DashboardOrderedCard;
  settings: VisualizationSettings;
  dashboard: Dashboard;
  parameterValues: { [id: string]: ParameterValueOrArray };
}

export function Heading({
  settings,
  isEditing,
  onUpdateVisualizationSettings,
  dashcard,
  dashboard,
  parameterValues,
}: HeadingProps) {
  const justAdded = useMemo(() => dashcard?.justAdded || false, [dashcard]);

  const [isFocused, { turnOn: toggleFocusOn, turnOff: toggleFocusOff }] =
    useToggle(justAdded);
  const isPreviewing = !isFocused;

  const handleTextChange = (text: string) =>
    onUpdateVisualizationSettings({ text });
  const preventDragging = (e: MouseEvent<HTMLInputElement>) =>
    e.stopPropagation();

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
  const placeholder = t`Heading`;

  const [text, setText] = useState(hasContent ? settings.text : "");

  if (isEditing) {
    return (
      <InputContainer
        data-testid="editing-dashboard-heading-container"
        isEmpty={!hasContent}
        isPreviewing={isPreviewing}
        onClick={toggleFocusOn}
      >
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
            value={content}
            autoFocus={justAdded || isFocused}
            onChange={e => setText(e.target.value)}
            onMouseDown={preventDragging}
            onBlur={() => {
              handleTextChange(text);
              toggleFocusOff();
            }}
          />
        )}
      </InputContainer>
    );
  }

  return (
    <HeadingContainer>
      <HeadingContent data-testid="saved-dashboard-heading-content">
        {content}
      </HeadingContent>
    </HeadingContainer>
  );
}
