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
import { FormattingSection } from "./FormattingSection";
import { MetadataSection } from "./MetadataSection";

interface Props {
  databaseId: DatabaseId;
  field: Field;
}

export const FieldSection = ({ databaseId, field }: Props) => {
  return (
    <Stack gap={0} h="100%">
      <Title order={2} pb="md">
        {getFieldDisplayName(field)}
      </Title>

      <Stack gap="xl">
        <DataSection field={field} />
        <MetadataSection databaseId={databaseId} field={field} />
        <BehaviorSection databaseId={databaseId} field={field} />
        <FormattingSection field={field} />

        <Stack gap="sm" mt="lg">
          <RescanFieldButton fieldId={getRawTableFieldId(field)} />
          <DiscardFieldValuesButton fieldId={getRawTableFieldId(field)} />
        </Stack>
      </Stack>
    </Stack>
  );
};
