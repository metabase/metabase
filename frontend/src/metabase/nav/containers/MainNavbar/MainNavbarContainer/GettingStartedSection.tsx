import { useDisclosure } from "@mantine/hooks";
import type { PropsWithChildren } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { getCanAccessOnboardingPage } from "metabase/home/selectors";
import { useSelector } from "metabase/lib/redux";
import { Collapse, Group, Icon, UnstyledButton } from "metabase/ui";

import { PaddedSidebarLink, SidebarHeading } from "../MainNavbar.styled";
import { trackOnboardingChecklistOpened } from "../analytics";
import type { SelectedItem } from "../types";

export const GettingStartedSection = ({
  nonEntityItem,
  onModalOpen,
  children,
}: PropsWithChildren<{
  nonEntityItem: SelectedItem;
  onModalOpen: () => void;
}>) => {
  const [opened, { toggle }] = useDisclosure(true);

  const canAccessOnboarding = useSelector(getCanAccessOnboardingPage);

  const ONBOARDING_URL = "/getting-started";
  const isOnboardingPageSelected = nonEntityItem?.url === ONBOARDING_URL;

  const isEmpty = !children && !canAccessOnboarding;

  if (isEmpty) {
    return null;
  }

  return (
    <div aria-selected={opened} role="tab">
      <Group
        align="center"
        gap="sm"
        onClick={toggle}
        component={UnstyledButton}
        c="text-medium"
        mb="sm"
        className={CS.cursorPointer}
      >
        <SidebarHeading>{t`Getting Started`}</SidebarHeading>
        <Icon name={opened ? "chevrondown" : "chevronright"} size={8} />
      </Group>

      <Collapse in={opened} transitionDuration={0} role="tabpanel">
        <PaddedSidebarLink icon="add_data" onClick={onModalOpen}>
          {t`Add data`}
        </PaddedSidebarLink>
        {canAccessOnboarding && (
          <PaddedSidebarLink
            icon="learn"
            url={ONBOARDING_URL}
            isSelected={isOnboardingPageSelected}
            onClick={() => trackOnboardingChecklistOpened()}
          >
            {/* eslint-disable-next-line no-literal-metabase-strings -- We only show this to non-whitelabelled instances */}
            {t`How to use Metabase`}
          </PaddedSidebarLink>
        )}
        {children}
      </Collapse>
    </div>
  );
};
