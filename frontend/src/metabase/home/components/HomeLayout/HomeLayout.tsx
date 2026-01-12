import type { ReactNode } from "react";
import { useState } from "react";
import { t } from "ttag";

import { LighthouseIllustration } from "metabase/common/components/LighthouseIllustration";
import { useHasTokenFeature, useSetting } from "metabase/common/hooks";
import { EmbeddingHubHomePage } from "metabase/embedding/embedding-hub";
import { useSelector } from "metabase/lib/redux";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";
import { getLandingPageIllustration } from "metabase/selectors/whitelabel";
import { Tooltip } from "metabase/ui";

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

export const HomeLayout = ({ children }: HomeLayoutProps): ReactNode => {
  const [showModal, setShowModal] = useState(false);
  const isAdmin = useSelector(getUserIsAdmin);
  const landingPageIllustration = useSelector(getLandingPageIllustration);

  const user = useSelector(getUser);
  const embeddingHomepage = useSetting("embedding-homepage");
  const isSimpleEmbeddingAvailable = useHasTokenFeature("embedding_simple");

  if (
    embeddingHomepage === "visible" &&
    user?.is_superuser &&
    isSimpleEmbeddingAvailable
  ) {
    return <EmbeddingHubHomePage />;
  }

  return (
    <LayoutRoot data-testid="home-page">
      {landingPageIllustration &&
        (landingPageIllustration.isDefault ? (
          <LighthouseIllustration />
        ) : (
          <LayoutIllustration
            data-testid="landing-page-illustration"
            backgroundImageSrc={landingPageIllustration.src}
          />
        ))}
      <HomeGreeting />
      {isAdmin && (
        <Tooltip label={t`Pick a dashboard to serve as the homepage`}>
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
