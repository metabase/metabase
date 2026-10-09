import type { ReactNode } from "react";

import { LighthouseIllustration } from "metabase/common/components/LighthouseIllustration";
import { LogoIcon } from "metabase/common/components/LogoIcon";
import { useSelector } from "metabase/redux";
import { getLoginPageIllustration } from "metabase/selectors/whitelabel";
import { Box, Card, Stack } from "metabase/ui";

interface AuthLayoutProps {
  children?: ReactNode;
}

export const AuthLayout = ({ children }: AuthLayoutProps): JSX.Element => {
  const loginPageIllustration = useSelector(getLoginPageIllustration);

  return (
    <Box
      data-testid="login-page"
      pos="relative"
      mih="100vh"
      bg="background_page-secondary"
    >
      {loginPageIllustration &&
        (loginPageIllustration.isDefault ? (
          <LighthouseIllustration />
        ) : (
          <Box
            data-testid="login-page-illustration"
            pos="absolute"
            top={0}
            left={0}
            w="100%"
            h="100%"
            bgsz="100% auto"
            bgr="no-repeat"
            bgp="right bottom"
            style={{ backgroundImage: `url("${loginPageIllustration.src}")` }}
          />
        ))}
      <Stack
        gap={0}
        justify="center"
        align="center"
        pos="relative"
        pt="xl"
        px="lg"
        pb="3rem"
        mih="100vh"
      >
        <LogoIcon height={65} />
        <Card
          w={{ base: "100%", sm: "30.875rem" }}
          mt="xl"
          py="xxxl"
          px={{ base: "xl", sm: "3.5rem" }}
          bg="background_page-primary"
          shadow="sm"
        >
          {children}
        </Card>
      </Stack>
    </Box>
  );
};
