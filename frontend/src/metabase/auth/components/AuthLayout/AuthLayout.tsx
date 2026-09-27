import type { ReactNode } from "react";

import { LighthouseIllustration } from "metabase/common/components/LighthouseIllustration";
import { LogoIcon } from "metabase/common/components/LogoIcon";
import { useSelector } from "metabase/redux";
import { getLoginPageIllustration } from "metabase/selectors/whitelabel";
import { Box, Flex, rem } from "metabase/ui";

import S from "./AuthLayout.module.css";

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
            className={S.illustration}
            pos="absolute"
            top={0}
            left={0}
            w="100%"
            h="100%"
            style={{ backgroundImage: `url("${loginPageIllustration.src}")` }}
          />
        ))}
      <Flex
        direction="column"
        justify="center"
        align="center"
        pos="relative"
        pt="xl"
        px="lg"
        pb={rem(48)}
        mih="100vh"
      >
        <LogoIcon height={65} />
        <Box
          className={S.card}
          w={{ base: "100%", sm: rem(494) }}
          mt="xl"
          py="xxxl"
          px={{ base: "xl", sm: rem(56) }}
          bg="background_page-primary"
        >
          {children}
        </Box>
      </Flex>
    </Box>
  );
};
