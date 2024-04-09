import type { RegularClickAction } from "metabase/visualizations/types";

import { ClickActionControl } from "./ClickActionControl";
import { Container, Divider } from "./ClickActionsPopover.styled";
import { ClickActionsViewSection } from "./ClickActionsViewSection";
import {
  getGroupedAndSortedActions,
  getSectionContentDirection,
  getSectionTitle,
} from "./utils";

interface Props {
  clickActions: RegularClickAction[];

  onClick: (action: RegularClickAction) => void;
}

export const ClickActionsView = ({
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
          <ClickActionsViewSection
            key={key}
            type={key}
            title={sectionTitle}
            contentDirection={contentDirection}
          >
            {withTopDivider && <Divider />}
            {actions.map(action => (
              <ClickActionControl
                key={action.name}
                action={action}
                onClick={() => onClick(action)}
              />
            ))}
            {withBottomDivider && <Divider />}
          </ClickActionsViewSection>
        );
      })}
    </Container>
  );
};
