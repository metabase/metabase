import { jt, t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink/ExternalLink";
import { UpsellWrapperDismissible } from "metabase/common/components/upsells/components/UpsellBannerDismissible";
import { UpsellGem } from "metabase/common/components/upsells/components/UpsellGem";
import { useDocsUrl } from "metabase/common/hooks/use-docs-url/use-docs-url";
import CS from "metabase/css/core/index.css";
import { Alert, Box, Flex, Text } from "metabase/ui";

export const DevInstanceUpsell = UpsellWrapperDismissible(
  function DevInstanceUpsell({ onDismiss }: { onDismiss?: () => void }) {
    // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- This link only shows for admins.
    const { url: devInstanceDocsUrl } = useDocsUrl(
      "installation-and-operation/development-instance",
    );
    return (
      <Alert
        color="core-brand"
        withCloseButton
        onClose={onDismiss}
        classNames={{ closeButton: CS.alignSelfStart }}
      >
        <Flex>
          <UpsellGem.New mt="0.125rem" />
          <Box ml="sm">
            <Text fw="bold">{t`Need a dedicated development environment?`}</Text>
            <Text lh="1.25rem">
              {jt`With ${(
                <ExternalLink
                  key="link"
                  href={devInstanceDocsUrl}
                >{t`Development instances`}</ExternalLink>
              )}, you can build and test your changes in a safe, isolated environment before syncing to production.`}
            </Text>
          </Box>
        </Flex>
      </Alert>
    );
  },
);
