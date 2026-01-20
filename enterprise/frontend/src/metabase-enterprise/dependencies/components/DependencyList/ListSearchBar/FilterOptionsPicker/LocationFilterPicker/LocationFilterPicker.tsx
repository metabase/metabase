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
  const { includePersonalCollections = true } = params;

  const handleIncludeInPersonalCollectionsChange = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const newValue = event.target.checked;
    onParamsChange({
      ...params,
      includePersonalCollections: newValue ? undefined : false,
    });
  };

  return (
    <Input.Wrapper label={t`Location`}>
      <Stack gap="sm" mt="sm">
        <Checkbox
          label={t`Include items in personal collections`}
          checked={includePersonalCollections}
          onChange={handleIncludeInPersonalCollectionsChange}
        />
      </Stack>
    </Input.Wrapper>
  );
}
