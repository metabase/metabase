import { useDeferredValue, useState } from "react";
import { t } from "ttag";

import { Box, Icon, Input, Stack, rem } from "metabase/ui";

import type { ChangeOptions, TreePath } from "../types";

import { Search } from "./Search";
import { Tree } from "./Tree";

interface Props {
  path: TreePath;
  className?: string;
  onChange: (path: TreePath, options?: ChangeOptions) => void;
}

export function TablePicker({ path, className, onChange }: Props) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  return (
    <Stack data-testid="table-picker" mih={rem(200)} className={className}>
      <Box p="xl" pb={0}>
        <Input
          leftSection={<Icon name="search" />}
          placeholder={t`Search tables`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </Box>

      {deferredQuery === "" ? (
        <Tree path={path} onChange={onChange} />
      ) : (
        <Search query={deferredQuery} path={path} onChange={onChange} />
      )}
    </Stack>
  );
}
