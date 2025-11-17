import type { ReactNode } from "react";
import { useState } from "react";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api/database";
import { LighthouseIllustration } from "metabase/common/components/LighthouseIllustration";
import { useHasTokenFeature, useSetting } from "metabase/common/hooks";
import { EmbeddingHubHomePage } from "metabase/embedding/embedding-hub";
import { useSelector } from "metabase/lib/redux";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";
import { getLandingPageIllustration } from "metabase/selectors/whitelabel";
import { Box, Loader, Tooltip } from "metabase/ui";

import { CustomHomePageModal } from "../CustomHomePageModal";
import { HomeBlueprintContent } from "../HomeBlueprintContent/HomeBlueprintContent";
import { hasAvailableBlueprints } from "../HomeBlueprintContent/utils";
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

  const { data: databases } = useListDatabasesQuery();

  if (
    embeddingHomepage === "visible" &&
    user?.is_superuser &&
    isSimpleEmbeddingAvailable
  ) {
    return <EmbeddingHubHomePage />;
  }

  let content = <Loader size="sm" />;
  if (databases && hasAvailableBlueprints(databases.data)) {
    content = <HomeBlueprintContent databases={databases.data} />;
  } else {
    content = (
      <>
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
      </>
    );
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
      <Box>{content}</Box>
    </LayoutRoot>
  );
};
