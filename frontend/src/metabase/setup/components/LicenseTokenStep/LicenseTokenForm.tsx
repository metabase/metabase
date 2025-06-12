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
import { STORE_URL } from "metabase/selectors/settings";
import { Anchor, Box, Divider, Flex, Icon, Popover, Text } from "metabase/ui";

import styles from "./LicenseTokenForm.module.css";
import { LICENSE_TOKEN_SCHEMA } from "./constants";

type LicenseTokenFormProps = {
  onSubmit: (token: string) => Promise<void>;
  onSkip: () => void;
  initialValue?: string;
};

const MOUSE_HOVER_DELAY = 200;

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
      href={STORE_URL}
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
                <Popover
                  opened={opened}
                  withArrow
                  position="bottom-end"
                  offset={{ mainAxis: 5 }}
                >
                  <Popover.Target>
                    <Icon
                      cursor="pointer"
                      name="info_filled"
                      aria-label={t`Token`}
                      size={16}
                      c="var(--mb-color-brand)"
                      onMouseEnter={() => debouncedMouseMove(true)}
                      onMouseLeave={() => debouncedMouseMove(false)}
                    ></Icon>
                  </Popover.Target>
                  <Popover.Dropdown
                    onMouseEnter={() => debouncedMouseMove(true)}
                    onMouseLeave={() => debouncedMouseMove(false)}
                  >
                    <Flex
                      className={styles.popoverContent}
                      direction="column"
                      gap="md"
                    >
                      <Text lh="lg">{t`Find your license token in the subscription confirmation email from Metabase`}</Text>
                      <Text lh="lg">{jt`Don't have one? ${storeLink}. During checkout, select the self-hosted version of the Pro plan.`}</Text>
                    </Flex>
                  </Popover.Dropdown>
                </Popover>
              }
              rightSectionWidth={16}
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
          <div className={styles.breakoutHorizontalRuleContainer}>
            <Divider className={styles.breakoutHorizontalRule} />
          </div>
          <Flex direction="column" gap="xs">
            <Anchor
              onClick={onSkip}
              variant="brand"
            >{t`I'll activate later`}</Anchor>
            <Text c="text-light" size="sm">
              {t`You won't have access to the paid features until you activate.`}
            </Text>
          </Flex>
        </Form>
      )}
    </FormProvider>
  );
};
