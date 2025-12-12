import { type ReactNode, useMemo } from "react";
import { jt, t } from "ttag";

import { type BoxProps, Stack, Text } from "metabase/ui";
import type { ForeignKey } from "metabase-types/api";

import { Relationship } from "./Relationship";

interface Props {
  rowId: string | number;
  rowName: ReactNode;
  tableForeignKeys: ForeignKey[];
  onClick?: () => void;
}

export function Relationships({
  rowId,
  rowName,
  tableForeignKeys,
  onClick,
}: Props & BoxProps): JSX.Element | null {
  const sortedForeignKeys = useMemo(
    () =>
      tableForeignKeys.toSorted((a, b) => {
        const aDisplayName = a.origin?.table?.display_name ?? "";
        const bDisplayName = b.origin?.table?.display_name ?? "";
        return aDisplayName.localeCompare(bDisplayName);
      }),
    [tableForeignKeys],
  );

  return (
    <Stack data-testid="relationships" gap="md">
      <Text c="text-secondary" fz={17}>
        {jt`${(
          <Text
            c="text-secondary"
            component="span"
            fw="bold"
            fz={17}
            key="row-name"
          >
            {rowName ? rowName : t`This record`}
          </Text>
        )} is connected to:`}
      </Text>

      <Stack gap="md">
        {sortedForeignKeys.map((fk) => {
          return (
            <Relationship
              key={`${fk.origin_id}-${fk.destination_id}`}
              fk={fk}
              rowId={rowId}
              onClick={onClick}
            />
          );
        })}
      </Stack>
    </Stack>
  );
}
