import { t } from "ttag";

import { Box, Text } from "metabase/ui";

import styles from "./NotificationScheduleWarning.module.css";

export const NotificationScheduleWarning = () => {
  return (
    <Box className={styles.warningContainer}>
      <Text className={styles.warningText}>
        {t`If an alert is still in progress when the next one is scheduled, the next alert will be skipped. This may result in fewer alerts than expected.`}
      </Text>
    </Box>
  );
};
