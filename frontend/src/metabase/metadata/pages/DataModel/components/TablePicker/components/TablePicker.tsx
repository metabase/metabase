import { useDeferredValue, useState } from "react";
import { t } from "ttag";

import { Button, Group, Icon, Input, Stack, rem } from "metabase/ui";

import type { RouteParams } from "../../../types";
import type { ChangeOptions, TreePath } from "../types";

import { SearchNew } from "./SearchNew";
import { Tree } from "./Tree";

interface TablePickerProps {
  params: RouteParams;
  path: TreePath;
  className?: string;
  onChange: (path: TreePath, options?: ChangeOptions) => void;
}

export function TablePicker({
  params,
  path,
  className,
  onChange,
}: TablePickerProps) {
  // TODO: UXW-1857 - add search support
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  return (
    <Stack data-testid="table-picker" mih={rem(200)} className={className}>
      <Group gap="md" p="xl" pb={0}>
        <Input
          flex="1"
          leftSection={<Icon name="search" />}
          placeholder={t`Search tables (use * as a wildcard)`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        <Button leftSection={<Icon name="filter" />}>{t`Filter`}</Button>
      </Group>

      {deferredQuery === "" ? (
        <Tree path={path} onChange={onChange} />
      ) : (
        <SearchNew query={deferredQuery} params={params} />
      )}
    </Stack>
  );
}
