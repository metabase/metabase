import { t } from "ttag";

import { Text } from "metabase/ui";

import { ChecklistItem } from "../ChecklistItem";
import { VideoTutorial } from "../VideoTutorial";
import type { OnboardingItemProps } from "../types";

export const DashboardItem = ({ itemRef }: OnboardingItemProps) => (
  <ChecklistItem
    value="dashboard"
    icon="dashboard"
    label={t`Create a dashboard`}
    itemRef={itemRef}
  >
    <VideoTutorial
      id="FAst1nabBck"
      si="yVMfXeh0tkr1Yt8_"
      title="How to use dashboards?"
    />
    <Text>
      {t`You can present questions, text, and links on a dashboard, organized into tabs. Add filters and interactive click behavior so people can explore the data and update visualizations in place.`}
    </Text>
  </ChecklistItem>
);
