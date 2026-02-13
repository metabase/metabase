import { t } from "ttag";

import { Flex, Group } from "metabase/ui";
import type { ReplaceSourceEntry } from "metabase-types/api";

import { DataSourcePicker } from "./DataSourcePicker";
import S from "./PageHeader.module.css";

type PageHeaderProps = {
  source: ReplaceSourceEntry | undefined;
  target: ReplaceSourceEntry | undefined;
};

export function PageHeader({ source, target }: PageHeaderProps) {
  return (
    <Flex className={S.header} direction="column">
      <Group wrap="nowrap">
        <DataSourcePicker
          entry={source}
          label={t`Find all occurrences of this data source`}
          placeholder={t`We'll look for every query in your instance that uses this data source.`}
        />
        <DataSourcePicker
          entry={target}
          label={t`Replace it with this data source`}
          placeholder={t`This data source will be used in every matching query instead.`}
        />
      </Group>
    </Flex>
  );
}
