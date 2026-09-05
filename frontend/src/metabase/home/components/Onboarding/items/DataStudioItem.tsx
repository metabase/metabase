import { jt, t } from "ttag";

import { canAccessDataStudio } from "metabase/common/data-studio/selectors";
import { useSelector } from "metabase/redux";
import { Text } from "metabase/ui";
import * as Urls from "metabase/urls";

import type { ChecklistImageStyles } from "../ChecklistItem";
import { ChecklistImage, ChecklistItem } from "../ChecklistItem";
import type { OnboardingItemProps } from "../types";

const ILLUSTRATION_STYLE: ChecklistImageStyles = {
  "--leaf-x": 47,
  "--leaf-y": 44,
  "--leaf-w": 767,
  "--leaf-h": 427,
  "--leaf-border": "1px solid var(--mb-color-border-neutral)",
  "--leaf-radius": "calc(8 * var(--media-unit))",
  "--leaf-shadow": "var(--media-leaf-elevation)",
};

export const DataStudioItem = ({ value, itemRef }: OnboardingItemProps) => {
  const canAccess = useSelector(canAccessDataStudio);

  return (
    <ChecklistItem
      value={value}
      itemRef={itemRef}
      icon="repository"
      label={t`Build your semantic layer in Data Studio`}
      actions={
        canAccess
          ? [
              {
                label: t`Go to Data studio`,
                to: Urls.dataStudio(),
                cta: "primary",
              },
            ]
          : []
      }
    >
      <ChecklistImage
        alt={t`A table in the Data Studio library`}
        src="app/assets/img/onboarding_data_studio.png"
        srcSet="app/assets/img/onboarding_data_studio@2x.png 2x"
        style={ILLUSTRATION_STYLE}
      />
      <Text>
        {jt`${(
          <b key="data-studio">{t`Data Studio`}</b>
        )} has all the tools you'll need to get your data organized. ${(
          <b key="transform">{t`Transform`}</b>
        )} your raw data into tables that are easy to query, define key ${(
          <b key="metrics">{t`Metrics`}</b>
        )}, see how data flows through the ${(
          <b key="dependency-graph">{t`Dependency graph`}</b>
        )}, and more.`}
      </Text>
    </ChecklistItem>
  );
};
