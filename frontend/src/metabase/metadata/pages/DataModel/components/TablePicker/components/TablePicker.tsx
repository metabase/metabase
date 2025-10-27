import { useDeferredValue, useState } from "react";
import { t } from "ttag";

import { Box, Icon, Input, Stack } from "metabase/ui";

import type { ChangeOptions, TreePath } from "../types";

import { Search } from "./Search";
import S from "./TablePicker.module.css";
import { Tree } from "./Tree";

interface TablePickerProps {
  path: TreePath;
  className?: string;
  onChange: (path: TreePath, options?: ChangeOptions) => void;
}

export function TablePicker({ path, className, onChange }: TablePickerProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  return (
    <Stack data-testid="table-picker" gap={0} h="100%" className={className}>
      <Box px="lg" py="md">
        <Input
          leftSection={<Icon name="search" />}
          placeholder={t`Search tables`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </Box>
      <Box className={S.contentContainer}>
        {deferredQuery === "" ? (
          <Tree path={path} onChange={onChange} />
        ) : (
          <Search query={deferredQuery} path={path} onChange={onChange} />
        )}
      </Box>
    </Stack>
  );
}
