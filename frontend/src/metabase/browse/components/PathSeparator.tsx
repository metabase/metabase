import { Text } from "metabase/ui";

import { pathSeparatorChar } from "./constants";

export const PathSeparator = () => (
  <Text
    className="collection-path-separator"
    color="text-light"
    mx=".2rem"
    py={1}
  >
    {pathSeparatorChar}
  </Text>
);
