import { Icon } from "metabase/ui";

import { useMiniPickerContext } from "../context";

import { MiniPickerItem } from "./MiniPickerItem";

export function MiniPickerHeader() {
  const { path, setPath } = useMiniPickerContext();
  const backName = path[path.length - 1]?.name || "";
  return (
    <MiniPickerItem
      name={backName}
      data-testid="mini-picker-header"
      data-autofocus
      variant="mb-light"
      leftSection={<Icon name="chevronleft" />}
      onClick={() => {
        setPath((prevPath) => prevPath.slice(0, -1));
      }}
    />
  );
}
