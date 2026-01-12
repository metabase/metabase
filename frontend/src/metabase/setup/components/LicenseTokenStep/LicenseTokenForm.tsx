import { c, t } from "ttag";

import ExternalLink from "metabase/common/components/ExternalLink";
import FormSubmitButton from "metabase/common/components/FormSubmitButton";
import { useStoreUrl } from "metabase/common/hooks";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormTextInput,
} from "metabase/forms";
import {
  Box,
  Button,
  Divider,
  Flex,
  HoverCard,
  Icon,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";

import { LICENSE_TOKEN_SCHEMA } from "./constants";

type LicenseTokenFormProps = {
  onSubmit: (token: string) => Promise<void>;
  onSkip: () => void;
  initialValue?: string;
};

const CARD_WIDTH = 300;

export const LicenseTokenForm = ({
  onSubmit,
  onSkip,
  initialValue = "",
}: LicenseTokenFormProps) => {
  const storeUrl = useStoreUrl("checkout");
  const storeLink = (
    <ExternalLink
      href={storeUrl}
      key="store-link"
    >{t`Try Metabase for free`}</ExternalLink>
  );

  return (
    <FormProvider
      initialValues={{ license_token: initialValue }}
      validationSchema={LICENSE_TOKEN_SCHEMA}
      onSubmit={(values) => onSubmit(values.license_token)}
    >
      {({ errors, setValues }) => (
        <Form>
          <Box mb="md">
            <FormTextInput
              aria-label={t`Token`}
              placeholder={t`Paste your token here`}
              name="license_token"
              onChange={(e) => {
                const val = e.target.value;
                const trimmed = val.trim();
                if (val !== trimmed) {
                  setValues({ license_token: trimmed });
                }
              }}
              rightSection={
                <Box>
                  <HoverCard position="bottom-end">
                    <HoverCard.Target>
                      <UnstyledButton
                        component={Icon}
                        size="1rem"
                        name="info"
                        aria-label={t`Token details information`}
                        c="brand"
                      />
                    </HoverCard.Target>
                    <HoverCard.Dropdown>
                      <Stack gap="md" p="md" w={CARD_WIDTH}>
                        <Text lh="lg">{t`Find your license token in the subscription confirmation email from Metabase`}</Text>
                        <Text lh="lg">{c(
                          "When users have no token, they can visit the link ${0} pointing to the store, where they can purchase a license for Metabase.",
                        )
                          .jt`Don't have one? ${storeLink}. During checkout, select the self-hosted version of the Pro plan.`}</Text>
                      </Stack>
                    </HoverCard.Dropdown>
                  </HoverCard>
                </Box>
              }
              rightSectionWidth="2rem"
            />
            <FormErrorMessage />
          </Box>
          <Flex gap="sm">
            <FormSubmitButton
              title={t`Activate`}
              activeTitle={t`Activating`}
              disabled={!!errors.license_token}
              primary
            />
          </Flex>
          <Divider mx={{ base: "-2rem", sm: "-4rem" }} mt="xl" mb="md" />
          <Box>
            <Button
              onClick={onSkip}
              variant="subtle"
              px={0}
              fw="normal"
            >{t`I'll activate later`}</Button>
            <Text c="text-tertiary" size="sm">
              {t`You won't have access to paid features until you activate.`}
            </Text>
          </Box>
        </Form>
      )}
    </FormProvider>
  );
};
