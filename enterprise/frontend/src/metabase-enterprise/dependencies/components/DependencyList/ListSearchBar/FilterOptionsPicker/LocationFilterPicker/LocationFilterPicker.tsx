import type { ChangeEvent } from "react";
import { t } from "ttag";

import type * as Urls from "metabase/lib/urls";
import { Checkbox, Input, Stack } from "metabase/ui";

type LocationFilterPickerProps = {
  params: Urls.DependencyListParams;
  onParamsChange: (params: Urls.DependencyListParams) => void;
};

export function LocationFilterPicker({
  params,
  onParamsChange,
}: LocationFilterPickerProps) {
  const handleIncludeInPersonalCollectionsChange = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    onParamsChange({
      ...params,
      includePersonalCollections: event.target.checked,
    });
  };

  return (
    <Input.Wrapper label={t`Location`}>
      <Stack gap="sm" mt="sm">
        <Checkbox
          label={t`Include items in personal collections`}
          onChange={handleIncludeInPersonalCollectionsChange}
        />
      </Stack>
    </Input.Wrapper>
  );
}
