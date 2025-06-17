import { Box, Flex, Icon } from "metabase/ui";
import * as Lib from "metabase-lib";

import S from "./NativeQueryValidationError.module.css";

const NativeQueryValidationError = ({ query }: { query: Lib.Query }) => {
  const validationErrors = Lib.validateNativeQuery(query);

  if (!validationErrors.length) {
    return null;
  }

  return (
    <Flex
      p="sm"
      mt="auto"
      data-testid="query-validation-error"
      className={S.container}
    >
      <Icon name="warning" c="error" mr="sm" />
      <Box component="ul" m={0} p={0} className={S.list}>
        {validationErrors.map((err) => (
          <li key={err}>{err}</li>
        ))}
      </Box>
    </Flex>
  );
};

export { NativeQueryValidationError };
