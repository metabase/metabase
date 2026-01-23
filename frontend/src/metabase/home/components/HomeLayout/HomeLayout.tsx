import type { ReactNode } from "react";
import { useState } from "react";
import { t } from "ttag";

import { LighthouseIllustration } from "metabase/common/components/LighthouseIllustration";
import { useHasTokenFeature, useSetting } from "metabase/common/hooks";
import { EmbeddingHubHomePage } from "metabase/embedding/embedding-hub";
import { useSelector } from "metabase/lib/redux";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";
import { getLandingPageIllustration } from "metabase/selectors/whitelabel";
import { Box, Button, Icon, Tooltip } from "metabase/ui";

import { CustomHomePageModal } from "../CustomHomePageModal";
import { HomeGreeting } from "../HomeGreeting";

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
    <Box
      data-testid="home-page"
      pos="relative"
      p={{
        base: "1rem",
        md: "3rem 4rem",
        lg: "4rem 7rem 2rem",
        xl: "10rem 15rem 4rem",
      }}
      mih="100%"
      bg="background-secondary"
    >
      {landingPageIllustration &&
        (landingPageIllustration.isDefault ? (
          <LighthouseIllustration />
        ) : (
          <Box
            data-testid="landing-page-illustration"
            pos="absolute"
            inset={0}
            bgsz="100% auto"
            bgr="no-repeat"
            bgp="bottom"
            style={{
              backgroundImage: `url(${landingPageIllustration.src})`,
            }}
          />
        ))}
      <HomeGreeting />
      {isAdmin && (
        <Tooltip label={t`Pick a dashboard to serve as the homepage`}>
          <Button
            pos="absolute"
            top="0.75rem"
            right="1rem"
            variant="subtle"
            leftSection={<Icon name="pencil" />}
            onClick={() => setShowModal(true)}
          >
            {t`Customize`}
          </Button>
        </Tooltip>
      )}
      <Box
        pos="relative"
        mt={{
          base: "2.5rem",
          md: "4rem",
          lg: "6rem",
        }}
      >
        {children}
      </Box>
      <CustomHomePageModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
      />
    </Box>
  );
};
