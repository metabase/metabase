import { useMemo } from "react";
import { t } from "ttag";

import { Select, Text } from "metabase/ui";
import type {
  ClickBehavior,
  ClickBehaviorLinkTarget,
  CustomDestinationClickBehavior,
} from "metabase-types/api";

const AUTOMATIC_VALUE = "";

type Props = {
  clickBehavior: CustomDestinationClickBehavior;
  updateSettings: (settings: Partial<ClickBehavior>) => void;
};

export function LinkTargetControl({ clickBehavior, updateSettings }: Props) {
  const value = clickBehavior.linkTarget ?? AUTOMATIC_VALUE;

  const selectOptions = useMemo(
    () => [
      { value: AUTOMATIC_VALUE, label: t`Default` },
      { value: "_self", label: t`Same tab` },
      { value: "_blank", label: t`New tab` },
      { value: "_parent", label: t`Parent frame` },
      { value: "_top", label: t`Top window` },
    ],
    [],
  );

  return (
    <>
      <Select
        label={t`Open link in`}
        data={selectOptions}
        value={value}
        onChange={(next) => {
          const v = next ?? AUTOMATIC_VALUE;
          if (v === AUTOMATIC_VALUE) {
            const nextBehavior = { ...clickBehavior };
            delete nextBehavior.linkTarget;
            updateSettings(nextBehavior);
          } else {
            updateSettings({
              ...clickBehavior,
              linkTarget: v as ClickBehaviorLinkTarget,
            });
          }
        }}
        mt="md"
      />
      <Text size="sm" c="text-secondary" mt="xs">
        {t`Default follows the usual rules: in-app destinations open in the same tab, external URLs in a new tab.`}
      </Text>
    </>
  );
}
