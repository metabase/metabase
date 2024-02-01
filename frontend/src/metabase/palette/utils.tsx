import type { ReactNode } from "react";
import type { JsonStructureItem } from "react-cmdk";
import { uuid } from "metabase/lib/utils";
import { Icon } from "metabase/ui";
import type { IconName } from "metabase/ui";

export const createPaletteAction = ({
  children,
  icon,
  onClick,
}: Pick<JsonStructureItem, "children" | "onClick"> & {
  icon?: ReactNode;
}): JsonStructureItem => ({
  id: uuid(),
  children,
  icon:
    typeof icon === "string"
      ? () => <Icon name={icon as IconName} />
      : icon
      ? () => <>{icon}</>
      : () => <Icon name="click" />,
  onClick,
});
