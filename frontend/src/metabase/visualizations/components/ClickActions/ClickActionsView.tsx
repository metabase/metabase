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
  close: () => void;
  onClick: (action: RegularClickAction) => void;
}

export const ClickActionsView = ({
  clickActions,
  close,
  onClick,
}: Props): JSX.Element => {
  const sections = getGroupedAndSortedActions(clickActions);

  const hasOnlyOneSection = sections.length === 1;

  return (
    <Container>
      {sections.map(([sectionKey, actions]) => {
        const sectionTitle = getSectionTitle(sectionKey, actions);
        const contentDirection = getSectionContentDirection(
          sectionKey,
          actions,
        );
        const withBottomDivider =
          sectionKey === "records" && !hasOnlyOneSection;
        const withTopDivider = sectionKey === "details" && !hasOnlyOneSection;

        return (
          <ClickActionsViewSection
            key={sectionKey}
            type={sectionKey}
            title={sectionTitle}
            contentDirection={contentDirection}
          >
            {withTopDivider && <Divider />}
            {actions.map(action => (
              <ClickActionControl
                key={action.name}
                action={action}
                close={close}
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
