import type { ReactNode } from "react";
import { useState } from "react";
import { t } from "ttag";

import Tooltip from "metabase/core/components/Tooltip/Tooltip";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { getLandingPageIllustration } from "metabase/selectors/whitelabel";

import { CustomHomePageModal } from "../CustomHomePageModal";
import { HomeGreeting } from "../HomeGreeting";

import {
  LayoutBody,
  LayoutEditButton,
  LayoutIllustration,
  LayoutRoot,
} from "./HomeLayout.styled";

interface HomeLayoutProps {
  children?: ReactNode;
}

export const HomeLayout = ({ children }: HomeLayoutProps): JSX.Element => {
  const [showModal, setShowModal] = useState(false);
  const isAdmin = useSelector(getUserIsAdmin);
  const landingPageIllustration = useSelector(getLandingPageIllustration);

  return (
    <LayoutRoot data-testid="home-page">
      {landingPageIllustration && (
        <LayoutIllustration
          data-testid="landing-page-illustration"
          backgroundImageSrc={landingPageIllustration.src}
          isDefault={landingPageIllustration.isDefault}
        />
      )}
      <HomeGreeting />
      {isAdmin && (
        <Tooltip tooltip={t`Pick a dashboard to serve as the homepage`}>
          <LayoutEditButton
            icon="pencil"
            borderless
            onClick={() => setShowModal(true)}
          >
            {t`Customize`}
          </LayoutEditButton>
        </Tooltip>
      )}
      <LayoutBody>{children}</LayoutBody>
      <CustomHomePageModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
      />
    </LayoutRoot>
  );
};
