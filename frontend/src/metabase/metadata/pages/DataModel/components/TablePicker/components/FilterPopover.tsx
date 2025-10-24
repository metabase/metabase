import { useState } from "react";
import { t } from "ttag";

import {
  DataSourceInput,
  LayerInput,
  UserInput,
} from "metabase/metadata/components";
import { Button, Flex, Stack } from "metabase/ui";
import type {
  TableDataSource,
  TableVisibilityType2,
  UserId,
} from "metabase-types/api";

export interface FilterState {
  visibilityType2?: TableVisibilityType2;
  dataSource?: TableDataSource | null;
  ownerEmail?: string | null;
  ownerUserId?: UserId | null;
}

interface Props {
  filters: FilterState;
  onClose: () => void;
  onSubmit: (filters: FilterState) => void;
}

export function FilterPopover({ filters, onClose, onSubmit }: Props) {
  const [visibilityType2, setVisibilityType2] = useState<
    TableVisibilityType2 | undefined
  >(filters.visibilityType2);
  const [dataSource, setDataSource] = useState<
    TableDataSource | null | undefined
  >(filters.dataSource);
  const [ownerEmail, setOwnerEmail] = useState<string | null | undefined>(
    filters.ownerEmail,
  );
  const [ownerUserId, setOwnerUserId] = useState<UserId | null | undefined>(
    filters.ownerUserId,
  );

  const handleApply = () => {
    const filters: FilterState = {};

    // if (visibilityType2 !== undefined) {
    filters.visibilityType2 = visibilityType2;
    // }

    // if (dataSource !== undefined) {
    filters.dataSource = dataSource;
    // }

    // if (ownerEmail !== undefined || ownerUserId !== undefined) {
    filters.ownerEmail = ownerEmail;
    filters.ownerUserId = ownerUserId;
    // }

    onSubmit(filters);
  };

  return (
    <Stack gap="md" p="lg">
      <LayerInput
        clearable
        value={visibilityType2}
        onChange={setVisibilityType2}
      />

      <UserInput
        clearable
        email={ownerEmail}
        label={t`Owner`}
        userId={ownerUserId}
        onEmailChange={(email) => {
          setOwnerEmail(email);
          setOwnerUserId(null);
        }}
        onUserIdChange={(userId) => {
          setOwnerEmail(null);
          setOwnerUserId(userId);
        }}
      />

      <DataSourceInput
        clearable
        showMetabaseTransform
        value={dataSource}
        onChange={setDataSource}
      />

      <Flex justify="flex-end" gap="sm">
        <Button variant="subtle" onClick={onClose}>
          {t`Cancel`}
        </Button>

        <Button variant="primary" onClick={handleApply}>
          {t`Apply`}
        </Button>
      </Flex>
    </Stack>
  );
}
