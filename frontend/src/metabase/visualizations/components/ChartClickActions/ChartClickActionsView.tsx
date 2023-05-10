import React from "react";
import { ClickAction } from "metabase/modes/types";
import { Container, Divider } from "./ChartClickActions.styled";
import {
  getGroupedAndSortedActions,
  getSectionContentDirection,
  getSectionTitle,
} from "./utils";
import { ChartClickActionsSection } from "./ChartClickActionsSection";
import { ChartClickActionControl } from "./ChartClickActionControl";

interface Props {
  clickActions: ClickAction[];

  onClick: (action: ClickAction) => void;
}

export const ChartClickActionsView = ({
  clickActions,
  onClick,
}: Props): JSX.Element => {
  const sections = getGroupedAndSortedActions(clickActions);

  const hasOnlyOneSection = sections.length === 1;

  return (
    <Container>
      {sections.map(([key, actions]) => {
        const sectionTitle = getSectionTitle(key, actions);
        const contentDirection = getSectionContentDirection(key, actions);
        const withBottomDivider = key === "records" && !hasOnlyOneSection;

        return (
          <ChartClickActionsSection
            key={key}
            type={key}
            title={sectionTitle}
            contentDirection={contentDirection}
          >
            {actions.map((action, index) => (
              <ChartClickActionControl
                key={action.name}
                action={action}
                onClick={() => onClick(action)}
              />
            ))}
            {withBottomDivider && <Divider />}
          </ChartClickActionsSection>
        );
      })}
    </Container>
  );
};
