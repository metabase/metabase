import type { ReactNode } from "react";

import { HoverCard, Icon, Stack } from "metabase/ui";

import S from "./LabelWithInfo.module.css";

type LabelWithInfoProps = {
  label: ReactNode;
  info?: ReactNode;
  htmlFor?: string;
};

export function LabelWithInfo({ label, info, htmlFor }: LabelWithInfoProps) {
  return (
    <label className={S.LabelWithInfo} htmlFor={htmlFor}>
      {label}
      {info && (
        <HoverCard shadow="xs">
          <HoverCard.Target>
            <Icon name="info" />
          </HoverCard.Target>
          <HoverCard.Dropdown maw="24rem">
            <Stack p="md" gap="sm">
              {info}
            </Stack>
          </HoverCard.Dropdown>
        </HoverCard>
      )}
    </label>
  );
}
