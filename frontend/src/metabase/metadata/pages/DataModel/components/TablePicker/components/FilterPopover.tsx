import { useState } from "react";
import { t } from "ttag";

import {
  DataSourceInput,
  LayerInput,
  UserInput,
} from "metabase/metadata/components";
import {
  ActionIcon,
  Button,
  Checkbox,
  Group,
  Icon,
  Stack,
  Tooltip,
} from "metabase/ui";
import type {
  TableDataSource,
  TableDataLayer,
  UserId,
} from "metabase-types/api";

import { getFiltersCount } from "../utils";

export interface FilterState {
  visibilityType2: TableDataLayer | null;
  dataSource: TableDataSource | "unknown" | null;
  ownerEmail: string | null;
  ownerUserId: UserId | "unknown" | null;
  orphansOnly: boolean | null;
}

interface Props {
  filters: FilterState;
  onClose: () => void;
  onSubmit: (filters: FilterState) => void;
}

export function FilterPopover({ filters, onClose, onSubmit }: Props) {
  const [form, setForm] = useState(filters);
  const filtersCount = getFiltersCount(form);

  const handleReset = () => {
    onSubmit({
      dataSource: null,
      ownerEmail: null,
      ownerUserId: null,
      visibilityType2: null,
      orphansOnly: null,
    });
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(form);
      }}
    >
      <Stack gap="md" p="lg">
        <LayerInput
          clearable
          value={form.visibilityType2}
          onChange={(visibilityType2) => {
            setForm((form) => ({ ...form, visibilityType2 }));
          }}
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
        />

        <DataSourceInput
          clearable
          showMetabaseTransform
          value={form.dataSource}
          onChange={(dataSource) => {
            setForm((form) => ({ ...form, dataSource }));
          }}
        />

        <Checkbox
          label={t`Only show unused tables`}
          checked={form.orphansOnly === true}
          onChange={(e) =>
            setForm((form) => ({ ...form, orphansOnly: e.target.checked }))
          }
        />

        <Group justify="space-between" wrap="nowrap">
          <Tooltip label={t`Reset filters`}>
            <ActionIcon disabled={filtersCount === 0} onClick={handleReset}>
              <Icon name="revert" />
            </ActionIcon>
          </Tooltip>

          <Group gap="sm" wrap="nowrap">
            <Button variant="subtle" onClick={onClose}>
              {t`Cancel`}
            </Button>

            <Button variant="primary" type="submit">
              {t`Apply`}
            </Button>
          </Group>
        </Group>
      </Stack>
    </form>
  );
}
