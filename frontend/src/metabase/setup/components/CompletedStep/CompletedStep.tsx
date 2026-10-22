import { type ChangeEvent, type JSX, useState } from "react";
import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/redux";
import { subscribeToNewsletter } from "metabase/setup/utils";
import { Box, Button, Flex, Stack, Switch, Text, Title } from "metabase/ui";

import { startAiConfig } from "../../actions";
import {
  getIsStepActive,
  getShouldOfferAiConfig,
  getUserEmail,
} from "../../selectors";

import { trackNewsletterToggleClicked } from "./analytics";

export const CompletedStep = (): JSX.Element | null => {
  const [checkboxValue, setCheckboxValue] = useState(false);
  const email = useSelector(getUserEmail);
  const shouldOfferAiConfig = useSelector(getShouldOfferAiConfig);
  const dispatch = useDispatch();

  const isStepActive = useSelector((state) =>
    getIsStepActive(state, "completed"),
  );
  if (!isStepActive) {
    return null;
  }

  const baseUrl = window.MetabaseRoot ?? "/";

  const handleSwitchToggle = (e: ChangeEvent<HTMLInputElement>) => {
    setCheckboxValue(e.target.checked);
    trackNewsletterToggleClicked(e.target.checked);
  };

  const handleGoToMetabase = () => {
    if (checkboxValue && email) {
      subscribeToNewsletter(email);
    }
  };

  return (
    <Stack
      component="section"
      p="xxxl"
      gap="xxl"
      mb="xl"
      bd="1px solid var(--mb-color-border-neutral)"
      bdrs="sm"
      bg="background_page-primary"
    >
      <Title order={2}>{t`You're all set up!`}</Title>
      {shouldOfferAiConfig && (
        <Flex
          align="center"
          justify="space-between"
          gap="xl"
          bd="1px solid var(--mb-color-border-neutral)"
          bdrs="xxs"
          p="xl"
        >
          <Box>
            <Text fw="bold">{t`Want to use AI in Metabase?`}</Text>
            <Text c="text-secondary">
              {t`Connect an AI provider to use AI explorations, SQL generation and Metabot.`}
            </Text>
          </Box>
          <Button
            flex="0 0 auto"
            onClick={() => dispatch(startAiConfig())}
          >{t`Set up AI`}</Button>
        </Flex>
      )}
      <Box bd="1px solid var(--mb-color-border-neutral)" bdrs="xxs" p="xl">
        <Switch
          checked={checkboxValue}
          onChange={handleSwitchToggle}
          label={t`Get infrequent emails about new releases and feature updates.`}
        />
      </Box>
      <Flex justify="flex-end">
        <Button
          component="a"
          href={baseUrl}
          variant="filled"
          size="lg"
          onClick={handleGoToMetabase}
        >
          {t`Take me to Metabase`}
        </Button>
      </Flex>
    </Stack>
  );
};
