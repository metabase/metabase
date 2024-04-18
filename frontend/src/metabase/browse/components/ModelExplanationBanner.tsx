import { useState } from "react";
import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { updateUserSetting } from "metabase/redux/settings";
import { getSetting } from "metabase/selectors/settings";
import { Flex, Paper, Icon, Text } from "metabase/ui";

import { BannerCloseButton, BannerModelIcon } from "./BrowseModels.styled";

export function ModelExplanationBanner() {
  const hasDismissedBanner = useSelector(state =>
    getSetting(state, "dismissed-browse-models-banner"),
  );
  const dispatch = useDispatch();

  const [shouldShowBanner, setShouldShowBanner] = useState(!hasDismissedBanner);

  const dismissBanner = () => {
    setShouldShowBanner(false);
    dispatch(
      updateUserSetting({
        key: "dismissed-browse-models-banner",
        value: true,
      }),
    );
  };

  if (!shouldShowBanner) {
    return null;
  }

  return (
    <Paper
      mt="1rem"
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
        <Text size="md" lh="1rem" mr="1rem">
          {t`Models help curate data to make it easier to find answers to questions all in one place.`}
        </Text>
        <BannerCloseButton onClick={dismissBanner}>
          <Icon name="close" />
        </BannerCloseButton>
      </Flex>
    </Paper>
  );
}
