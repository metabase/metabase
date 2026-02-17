import type { ReactNode } from "react";

import { Box, Divider, Title } from "metabase/ui";

import S from "./slack.module.css";

export const SetupSection = ({
  title,
  children,
  isDisabled,
}: {
  title: string;
  children?: ReactNode;
  isDisabled?: boolean;
}) => {
  return (
    <Box className={S.SetupSection}>
      <Title order={4} p="md" c={isDisabled ? "text-tertiary" : "brand"}>
        {title}
      </Title>
      {!isDisabled && (
        <>
          <Divider />
          <Box p="md">{children}</Box>
        </>
      )}
    </Box>
  );
};
