import {
  DiscardFieldValuesButton,
  RescanFieldButton,
} from "metabase/metadata/components";
import {
  getFieldDisplayName,
  getRawTableFieldId,
} from "metabase/metadata/utils/field";
import { Stack, Title } from "metabase/ui";
import type { DatabaseId, Field } from "metabase-types/api";

import { BehaviorSection } from "./BehaviorSection";
import { DataSection } from "./DataSection";
import S from "./FieldSection.module.css";
import { MetadataSection } from "./MetadataSection";

interface Props {
  databaseId: DatabaseId;
  field: Field;
}

export const FieldSection = ({ databaseId, field }: Props) => {
  return (
    <Stack gap={0} h="100%">
      <Title order={2} px="xl" py="lg" pb="md">
        {getFieldDisplayName(field)}
      </Title>

      <Stack className={S.container} gap="xl" h="100%" pb="lg" px="xl">
        <DataSection field={field} />
        <MetadataSection databaseId={databaseId} field={field} />
        <BehaviorSection databaseId={databaseId} field={field} />

        <Stack gap="sm" mt="xl">
          <RescanFieldButton fieldId={getRawTableFieldId(field)} />
          <DiscardFieldValuesButton fieldId={getRawTableFieldId(field)} />
        </Stack>
      </Stack>
    </Stack>
  );
};
