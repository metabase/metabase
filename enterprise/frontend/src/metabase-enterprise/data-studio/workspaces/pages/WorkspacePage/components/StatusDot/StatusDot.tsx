import { Box } from "metabase/ui";

import S from "./StatusDot.module.css";

export const StatusDot = ({
  "data-testid": dataTestId,
}: {
  "data-testid"?: string;
}) => {
  return <Box className={S.statusDot} data-testid={dataTestId} />;
};
