import { Box } from "metabase/ui";

import S from "./Error.module.css";

export function Error({ error }: { error: string }) {
  return (
    <Box p="md" mt="lg" className={S.error}>
      {error}
    </Box>
  );
}
