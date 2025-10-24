import { useState } from "react";
import { t } from "ttag";

import {
  DataSourceInput,
  LayerInput,
  type LimitedVisibilityType,
  UserInput,
  VisibilityInput,
} from "metabase/metadata/components";
import { Button, Flex, Stack } from "metabase/ui";
import type {
  TableDataSource,
  TableVisibilityType2,
  UserId,
} from "metabase-types/api";

export interface FilterState {
  visibilityType: LimitedVisibilityType | null;
  visibilityType2: TableVisibilityType2 | null;
  dataSource: TableDataSource | "unknown" | null;
  ownerEmail: string | null;
  ownerUserId: UserId | "unknown" | null;
}

interface Props {
  filters: FilterState;
  onClose: () => void;
  onSubmit: (filters: FilterState) => void;
}

export function FilterPopover({ filters, onClose, onSubmit }: Props) {
  const [form, setForm] = useState(filters);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(form);
      }}
    >
      <Stack gap="md" p="lg">
        <VisibilityInput
          clearable
          value={form.visibilityType}
          onChange={(visibilityType) => {
            setForm((form) => ({ ...form, visibilityType }));
          }}
        />

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

        <Flex justify="flex-end" gap="sm">
          <Button variant="subtle" onClick={onClose}>
            {t`Cancel`}
          </Button>

          <Button variant="primary" type="submit">
            {t`Apply`}
          </Button>
        </Flex>
      </Stack>
    </form>
  );
}
