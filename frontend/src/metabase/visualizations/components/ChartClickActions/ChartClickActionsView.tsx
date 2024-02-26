import type { RegularClickAction } from "metabase/modes/types";

import { ChartClickActionControl } from "./ChartClickActionControl";
import { Container, Divider } from "./ChartClickActions.styled";
import { ChartClickActionsSection } from "./ChartClickActionsSection";
import {
  getGroupedAndSortedActions,
  getSectionContentDirection,
  getSectionTitle,
} from "./utils";

interface Props {
  clickActions: RegularClickAction[];

  onClick: (action: RegularClickAction) => void;
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
        const withTopDivider = key === "details" && !hasOnlyOneSection;

        return (
          <ChartClickActionsSection
            key={key}
            type={key}
            title={sectionTitle}
            contentDirection={contentDirection}
          >
            {withTopDivider && <Divider />}
            {actions.map(action => (
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
