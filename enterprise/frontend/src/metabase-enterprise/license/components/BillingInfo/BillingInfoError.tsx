import { t } from "ttag";

import { SectionHeader } from "metabase/admin/settings/components/SettingsLicense";
import Alert from "metabase/core/components/Alert";
import { Text, Anchor, Box } from "metabase/ui";

export const BillingInfoError = () => {
  return (
    <>
      <SectionHeader>{t`Billing`}</SectionHeader>
      <Box mt="1rem" data-testid="billing-info-error">
        <Alert variant="error" icon="warning">
          <Text color="text-medium">
            {t`An error occurred while fetching information about your billing.`}
            <br />
            <strong>{t`Need help?`}</strong>{" "}
            {t`You can ask for billing help at `}
            <strong>
              <Anchor href="mailto:billing@metabase.com">
                billing@metabase.com
              </Anchor>
            </strong>
          </Text>
        </Alert>
      </Box>
    </>
  );
};
