import { t } from "ttag";

import { Banner } from "metabase/common/components/Banner";
import Link from "metabase/common/components/Link";
import { adminLicense } from "metabase/lib/urls";
import { Flex, Text } from "metabase/ui";

import styles from "./LicenseTokenMissingBanner.module.css";

export const LicenseTokenMissingBanner = ({
  onClose,
}: {
  onClose: () => void;
}) => {
  return (
    <Banner
      iconColor="var(--mb-color-text-white)"
      className={styles.BannerContainer}
      bg="var(--mb-color-background-inverse)"
      aria-label={t`License activation notice`}
      aria-live="polite"
      role="status"
      body={
        <Flex gap="xs" className={styles.BannerBody}>
          <Text lh="inherit" c="text-white" ta={{ base: "left", sm: "center" }}>
            {t`Unlock the paid features included in your Pro or Enterprise plan.`}
          </Text>
          <Link to={adminLicense()} variant="brand">
            {t`Activate your license`}
          </Link>
        </Flex>
      }
      closable
      onClose={onClose}
      py="md"
    ></Banner>
  );
};
