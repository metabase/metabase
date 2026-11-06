import { useState } from "react";
import { t } from "ttag";

import {
  trackDataStudioTablePickerFiltersApplied,
  trackDataStudioTablePickerFiltersCleared,
} from "metabase/common/data-studio/analytics";
import {
  DataSourceInput,
  LayerInput,
  UserInput,
} from "metabase/metadata/components";
import { Button, Checkbox, Group, Stack, Text } from "metabase/ui";

import { EMPTY_FILTERS } from "../constants";
import type { FilterState } from "../types";

interface Props {
  filters: FilterState;
  isLibraryEnabled: boolean;
  onSubmit: (filters: FilterState) => void;
}

export function FilterPopover({ filters, isLibraryEnabled, onSubmit }: Props) {
  const [form, setForm] = useState(filters);

  const handleReset = () => {
    trackDataStudioTablePickerFiltersCleared();
    onSubmit(EMPTY_FILTERS);
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
      <Stack gap="xxl" p="xl">
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
          showUnknown={false}
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

        {isLibraryEnabled && (
          <Checkbox
            label={t`Published tables only`}
            checked={form.publishedOnly === true}
            onChange={(e) =>
              setForm((form) => ({ ...form, publishedOnly: e.target.checked }))
            }
          />
        )}

        <Stack gap="md">
          <Text fw="bold">{t`Structure`}</Text>
          <Checkbox
            label={t`Needs review`}
            checked={form.needsReviewOnly === true}
            onChange={(e) =>
              setForm((form) => ({
                ...form,
                needsReviewOnly: e.target.checked,
              }))
            }
          />
          <Checkbox
            label={t`No role`}
            checked={form.noRoleOnly === true}
            onChange={(e) =>
              setForm((form) => ({ ...form, noRoleOnly: e.target.checked }))
            }
          />
          <Checkbox
            label={t`Hidden`}
            checked={form.hiddenOnly === true}
            onChange={(e) =>
              setForm((form) => ({ ...form, hiddenOnly: e.target.checked }))
            }
          />
          <Checkbox
            label={t`No main date`}
            checked={form.noMainDateOnly === true}
            onChange={(e) =>
              setForm((form) => ({ ...form, noMainDateOnly: e.target.checked }))
            }
          />
        </Stack>

        <Group justify="space-between" wrap="nowrap">
          <Button flex={1} onClick={handleReset}>{t`Clear filters`}</Button>

          <Button flex={1} variant="filled" type="submit">
            {t`Apply`}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
