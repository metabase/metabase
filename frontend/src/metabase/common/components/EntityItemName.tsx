import CS from "metabase/css/core/index.css";
import { Ellipsified, Text } from "metabase/ui";

export function EntityItemName({ name, id }: { name: string; id?: string }) {
  return (
    <Text
      component="h3"
      fw="bold"
      fz="inherit"
      c="inherit"
      className={CS.overflowHidden}
      id={id}
    >
      <Ellipsified>{name}</Ellipsified>
    </Text>
  );
}
