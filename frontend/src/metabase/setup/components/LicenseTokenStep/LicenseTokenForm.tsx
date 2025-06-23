import { useDisclosure } from "@mantine/hooks";
import { jt, t } from "ttag";
import { debounce } from "underscore";

import ExternalLink from "metabase/common/components/ExternalLink";
import FormSubmitButton from "metabase/common/components/FormSubmitButton";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormTextInput,
} from "metabase/forms";
import { getStoreUrl } from "metabase/selectors/settings";
import {
  Box,
  Button,
  Divider,
  Flex,
  Icon,
  Popover,
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

const MOUSE_HOVER_DELAY = 200;
const POPOVER_WIDTH = 300;

export const LicenseTokenForm = ({
  onSubmit,
  onSkip,
  initialValue = "",
}: LicenseTokenFormProps) => {
  const [opened, { close, open }] = useDisclosure(false);

  function handleMouseMove(isEntering: boolean) {
    if (isEntering) {
      open();
    } else {
      close();
    }
  }

  const debouncedMouseMove = debounce(handleMouseMove, MOUSE_HOVER_DELAY);

  const storeLink = (
    <ExternalLink
      href={getStoreUrl("checkout")}
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
                  <Popover
                    opened={opened}
                    withArrow
                    position="bottom-end"
                    offset={{ mainAxis: 5 }}
                  >
                    <Popover.Target>
                      <UnstyledButton
                        component={Icon}
                        size="1rem"
                        name="info_filled"
                        aria-label={t`Token details information`}
                        aria-expanded={opened}
                        c="brand"
                        onMouseEnter={() => debouncedMouseMove(true)}
                        onMouseLeave={() => debouncedMouseMove(false)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            debouncedMouseMove(!opened);
                          }
                        }}
                      />
                    </Popover.Target>
                    <Popover.Dropdown
                      onMouseEnter={() => debouncedMouseMove(true)}
                      onMouseLeave={() => debouncedMouseMove(false)}
                    >
                      <Stack gap="md" p="md" w={POPOVER_WIDTH}>
                        <Text lh="lg">{t`Find your license token in the subscription confirmation email from Metabase`}</Text>
                        <Text lh="lg">{jt`Don't have one? ${storeLink}. During checkout, select the self-hosted version of the Pro plan.`}</Text>
                      </Stack>
                    </Popover.Dropdown>
                  </Popover>
                </Box>
              }
              rightSectionWidth="1rem"
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
            <Text c="text-light" size="sm">
              {t`You won't have access to the paid features until you activate.`}
            </Text>
          </Box>
        </Form>
      )}
    </FormProvider>
  );
};
