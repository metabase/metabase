import { jt, t } from "ttag";

import { updateSetting } from "metabase/admin/settings/settings";
import ExternalLink from "metabase/core/components/ExternalLink";
import { useDispatch } from "metabase/lib/redux";
import { LegaleseStepDetailsContainer } from "metabase/public/components/widgets/LegaleseStep/LegaleseStep.styled";
import { Text, Button, Center, Stack, Title } from "metabase/ui";

export const LegaleseStep = ({
  goToNextStep,
}: {
  goToNextStep: () => void;
}) => {
  const dispatch = useDispatch();

  const onAcceptTerms = () => {
    dispatch(
      updateSetting({
        key: "show-static-embed-terms",
        value: false,
      }),
    );
    goToNextStep();
  };

  return (
    <Center bg="white" px="18rem" pt="6.25rem" pb="11.75rem">
      <Stack align="center" spacing="3rem">
        <Title order={2} fz="1.25rem">{t`First, some legalese`}</Title>

        <LegaleseStepDetailsContainer p="lg" w="40rem">
          <Text fw={700}>
            {jt`By clicking "Agree and continue" you're agreeing to ${(
              <ExternalLink
                key="embed-license-link"
                href="https://metabase.com/license/embedding"
                target="_blank"
              >
                {t`our embedding license.`}
              </ExternalLink>
            )}`}
          </Text>
          <Text>
            {/* eslint-disable-next-line no-literal-metabase-strings -- This only shows for admins */}
            {t`When you embed charts or dashboards from Metabase in your own application that application isn't subject to the Affero General Public License that covers the rest of Metabase, provided you keep the Metabase logo and the "Powered by Metabase" visible on those embeds.`}
          </Text>
          <Text>
            {t`You should, however, read the license text linked above as that is the actual license that you will be agreeing to by enabling this feature.`}
          </Text>
        </LegaleseStepDetailsContainer>

        <Button
          variant="filled"
          onClick={onAcceptTerms}
          data-testid="accept-legalese-terms-button"
        >{t`Agree and continue`}</Button>
      </Stack>
    </Center>
  );
};
