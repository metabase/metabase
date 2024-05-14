import { t } from "ttag";

import { useUserSetting } from "metabase/common/hooks";
import { Flex, Icon, Paper, Text } from "metabase/ui";

import { BannerCloseButton, BannerModelIcon } from "./BrowseModels.styled";

export const ModelExplanationBanner = () => {
  const [hasDismissedBanner, setHasDismissedBanner] = useUserSetting(
    "dismissed-browse-models-banner",
  );
  const dismissBanner = () => {
    setHasDismissedBanner(true);
  };

  if (hasDismissedBanner) {
    return null;
  }

  return (
    <Paper
      p="1rem"
      color="text-dark"
      bg="brand-lighter"
      shadow="0"
      radius="0.25rem"
      role="complementary"
      w="100%"
    >
      <Flex>
        <BannerModelIcon name="model" />
        <Text size="md" lh="1rem" style={{ marginInlineEnd: "1rem" }}>
          {t`Models help curate data to make it easier to find answers to questions all in one place.`}
        </Text>
        <BannerCloseButton onClick={dismissBanner}>
          <Icon name="close" />
        </BannerCloseButton>
      </Flex>
    </Paper>
  );
};
