import { Box } from "metabase/ui";

import S from "./StatusDot.module.css";

type StatusDotProps = {
  status?: "changed";
};

export const StatusDot = ({ status }: StatusDotProps) => {
  if (status !== "changed") {
    return null;
  }

  return <Box className={S.statusDot} />;
};
