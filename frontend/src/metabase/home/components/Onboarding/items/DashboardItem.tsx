import { t } from "ttag";

import { getUserCanWriteToCollections } from "metabase/current-user";
import { useDispatch, useSelector } from "metabase/redux";
import { setOpenModal } from "metabase/redux/ui";
import { Text } from "metabase/ui";

import { ChecklistItem } from "../ChecklistItem";
import { VideoTutorial } from "../VideoTutorial";
import type { OnboardingItemProps } from "../types";

export const DashboardItem = ({ value, itemRef }: OnboardingItemProps) => {
  const dispatch = useDispatch();
  const canWriteToCollections = useSelector(getUserCanWriteToCollections);

  return (
    <ChecklistItem
      value={value}
      itemRef={itemRef}
      icon="dashboard"
      label={t`Create a dashboard`}
      actions={
        canWriteToCollections
          ? [
              {
                label: t`Create a dashboard`,
                onClick: () => dispatch(setOpenModal("dashboard")),
                cta: "primary",
              },
            ]
          : []
      }
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
};
