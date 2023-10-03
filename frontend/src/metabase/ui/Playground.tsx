import { useState } from "react";
import { SearchUserPicker } from "metabase/search/components/SearchUserPicker";
import type { UserId } from "metabase-types/api";
import { Stack, Paper, Box } from "metabase/ui";

export const Playground = () => {
  const [value, setValue] = useState<UserId[]>([]);
  return (
    <Box p={"25vh 25vw"}>
      <Paper w="20rem">
        <Stack bg="white">
          <SearchUserPicker value={value} onChange={setValue} />
        </Stack>
      </Paper>
    </Box>
  );
};
