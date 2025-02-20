import { TagsInput } from "@mantine/core";
import { useState } from "react";
import { t } from "ttag";

import { useListAliasesQuery, useListCollectionItemsQuery } from "metabase/api";
import { SidesheetCardTitle } from "metabase/common/components/Sidesheet";
import { Box, Button, Group, Text } from "metabase/ui";
import type { CollectionId } from "metabase-types/api";

import { VersionItem } from "./VersionPopover";

export function AliasSelector(
  { alias, onChange, collectionId }:
  {
    alias?: string,
    onChange: (newValue: string, oldId?: number) => void;
    collectionId: CollectionId;
}) {
  const { data: aliases } = useListAliasesQuery();
  const [inputValue, setInputValue] = useState([alias].filter(Boolean));
  const [isSaving, setIsSaving] = useState(false);
  const { data: collectionItemsData } = useListCollectionItemsQuery({ id: collectionId });

  const baseAlias= alias?.split("@")[0] ?? '';
  const versions = alias ? collectionItemsData?.versions?.[baseAlias] : null;

  console.log({ alias, collectionItemsData, versions })

  const existingAliases = aliases?.map(alias => alias.alias) ?? [];
  const oldId = !!inputValue && aliases?.find(a => a.alias === inputValue[0])?.id;
  const handleSave = async () => {
    setIsSaving(true);
    await onChange(inputValue[0], oldId);
    setIsSaving(false);
  };

  return (
    <Box>
      <SidesheetCardTitle>Alias</SidesheetCardTitle>
      <Text fz="sm" lh="md" c="text-medium" mb="sm">
        {t`You can use an alias to link to a stable url for different versions of a dashboard or question like "/item/latest-kpis"`}
      </Text>
      <Group align="center" justify="end">
        <TagsInput
          data={existingAliases.filter(Boolean)}
          style={{ flexGrow: 1}}
          placeholder={t`my-alias`}
          value={inputValue}
          maxTags={1}
          onChange={setInputValue}
        />
      </Group>
      <Box ta="end" mt="sm">
        <Button
          type="submit"
          variant="filled"
          onClick={handleSave}
          loading={isSaving}
        >Save</Button>
      </Box>
      {versions && (
        <Box>
          <SidesheetCardTitle>Versions</SidesheetCardTitle>
          {versions.map((version) => (
            <VersionItem key={version.id} version={version} />
          ))}
        </Box>
      )}
    </Box>
  );
}