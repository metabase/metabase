import { jt, t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink/ExternalLink";
import { UpsellWrapperDismissible } from "metabase/common/components/upsells/components/UpsellBannerDismissible";
import { UpsellGem } from "metabase/common/components/upsells/components/UpsellGem";
import { useDocsUrl } from "metabase/common/hooks/use-docs-url/use-docs-url";
import CS from "metabase/css/core/index.css";
import { Alert } from "metabase/ui";

export const DevInstanceUpsell = UpsellWrapperDismissible(
  function DevInstanceUpsell({ onDismiss }: { onDismiss?: () => void }) {
    // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- This link only shows for admins.
    const { url: devInstanceDocsUrl } = useDocsUrl(
      "installation-and-operation/development-instance",
    );
    return (
      <Alert
        size="compact"
        color="core-brand"
        title={t`Need a dedicated development environment?`}
        icon={<UpsellGem.New />}
        withCloseButton
        onClose={onDismiss}
        classNames={{ closeButton: CS.alignSelfStart }}
      >
        {jt`With ${(
          <ExternalLink
            key="link"
            href={devInstanceDocsUrl}
          >{t`Development instances`}</ExternalLink>
        )}, you can build and test your changes in a safe, isolated environment before syncing to production.`}
      </Alert>
    );
  },
);
