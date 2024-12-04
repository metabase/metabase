import { useDisclosure } from "@mantine/hooks";
import type { PropsWithChildren } from "react";
import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { getLandingPageIllustration } from "metabase/selectors/whitelabel";
import {
  BackgroundImage,
  Box,
  Button,
  Group,
  Icon,
  Space,
  Text,
  Tooltip,
} from "metabase/ui";

import { CustomHomePageModal } from "../CustomHomePageModal";
import { HomeGreeting } from "../HomeGreeting";

export const HomeLayout = ({ children }: PropsWithChildren): JSX.Element => {
  const [isModalOpen, { open: openModal, close: closeModal }] =
    useDisclosure(false);
  const isAdmin = useSelector(getUserIsAdmin);
  const landingPageIllustration = useSelector(getLandingPageIllustration);

  const containerProps = landingPageIllustration
    ? {
        bgsz: landingPageIllustration?.isDefault
          ? "max(min(1728px, 260vh), 100%) auto"
          : "100% auto",
        src: landingPageIllustration.src,
      }
    : {};

  return (
    <Box
      component={BackgroundImage}
      w="100%"
      h="100%"
      bgr="no-repeat"
      bgp="bottom"
      p={{
        base: "md",
        md: "3rem 4rem",
        lg: "4rem 7rem 2rem",
        xl: "10rem 15rem 4rem",
      }}
      {...containerProps}
    >
      <Group pos="absolute" top="0.75rem" right="1rem" position="right">
        {isAdmin && (
          <Tooltip label={t`Pick a dashboard to serve as the homepage`}>
            <Button
              onClick={openModal}
              px="sm"
              py="xs"
              color="text-medium"
              variant="subtle"
              leftIcon={<Icon c="inherit" name="pencil" />}
              styles={{
                root: {
                  "&:hover": {
                    backgroundColor: "var(--mb-color-brand-alpha-04)",
                    color: "var(--mb-color-brand)",
                  },
                },
              }}
            >
              <Text c="inherit">{t`Customize`}</Text>
            </Button>
          </Tooltip>
        )}
      </Group>
      <HomeGreeting />
      <Space mt={{ base: "2.5rem", md: "4rem", lg: "6rem" }} />
      {children}
      <CustomHomePageModal isOpen={isModalOpen} onClose={closeModal} />
    </Box>
  );
};
