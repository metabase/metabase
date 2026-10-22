import type { HTMLAttributes, JSX } from "react";

import { Divider, Stack } from "metabase/ui";
import { trackClickActionPerformed } from "metabase/visualizations/analytics";
import type { RegularClickAction } from "metabase/visualizations/types";

import { ClickActionControl } from "./ClickActionControl";
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
  ...divProps
}: Props & Omit<HTMLAttributes<HTMLDivElement>, "onClick">): JSX.Element => {
  const sections = getGroupedAndSortedActions(clickActions);

  const hasOnlyOneSection = sections.length === 1;

  return (
    <Stack
      data-testid="click-actions-view"
      gap="sm"
      px="xl"
      py="lg"
      fw={700}
      {...divProps}
    >
      {sections.map(([sectionKey, actions]) => {
        const sectionTitle = getSectionTitle(sectionKey, actions);
        const contentDirection = getSectionContentDirection(
          sectionKey,
          actions,
        );
        const withBottomDivider =
          sectionKey === "records" && !hasOnlyOneSection;

        return (
          <ClickActionsViewSection
            key={sectionKey}
            type={sectionKey}
            title={sectionTitle}
            contentDirection={contentDirection}
          >
            {actions.map((action) => (
              <ClickActionControl
                key={action.name}
                action={action}
                close={close}
                onClick={() => {
                  trackClickActionPerformed(action);
                  onClick(action);
                }}
              />
            ))}
            {withBottomDivider && <Divider mx="-xl" my="sm" />}
          </ClickActionsViewSection>
        );
      })}
    </Stack>
  );
};
