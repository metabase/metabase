import { useState } from "react";
import { t } from "ttag";

import {
  DataSourceInput,
  LayerInput,
  UserInput,
} from "metabase/metadata/components";
import { Button, Checkbox, Group, Stack } from "metabase/ui";
import {
  trackDataStudioTablePickerFiltersApplied,
  trackDataStudioTablePickerFiltersCleared,
} from "metabase-enterprise/data-studio/analytics";

import type { FilterState } from "../types";

interface Props {
  filters: FilterState;
  onSubmit: (filters: FilterState) => void;
}

export function FilterPopover({ filters, onSubmit }: Props) {
  const [form, setForm] = useState(filters);

  const handleReset = () => {
    trackDataStudioTablePickerFiltersCleared();
    onSubmit({
      dataLayer: null,
      dataSource: null,
      ownerEmail: null,
      ownerUserId: null,
      unusedOnly: null,
    });
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        trackDataStudioTablePickerFiltersApplied();
        onSubmit(form);
      }}
      data-testid="table-picker-filter"
    >
      <Stack gap="xl" p="lg">
        <LayerInput
          clearable
          value={form.dataLayer}
          onChange={(dataLayer) => {
            setForm((form) => ({ ...form, dataLayer }));
          }}
          comboboxProps={{
            withinPortal: false,
            floatingStrategy: "fixed",
          }}
          autoFocus
        />

        <UserInput
          clearable
          email={form.ownerEmail}
          label={t`Owner`}
          userId={form.ownerUserId}
          onEmailChange={(ownerEmail) => {
            setForm((form) => ({ ...form, ownerEmail, ownerUserId: null }));
          }}
          onUserIdChange={(ownerUserId) => {
            setForm((form) => ({ ...form, ownerEmail: null, ownerUserId }));
          }}
          comboboxProps={{
            withinPortal: false,
            floatingStrategy: "fixed",
          }}
        />

        <DataSourceInput
          clearable
          showMetabaseTransform
          value={form.dataSource}
          onChange={(dataSource) => {
            setForm((form) => ({ ...form, dataSource }));
          }}
          comboboxProps={{
            withinPortal: false,
            floatingStrategy: "fixed",
          }}
        />

        <Checkbox
          label={t`Table isn’t referenced by anything`}
          checked={form.unusedOnly === true}
          onChange={(e) =>
            setForm((form) => ({ ...form, unusedOnly: e.target.checked }))
          }
        />

        <Group justify="space-between" wrap="nowrap">
          <Button flex={1} onClick={handleReset}>{t`Clear filters`}</Button>

          <Button flex={1} variant="primary" type="submit">
            {t`Apply`}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
