import { Icon, NavLink } from "metabase/ui";

import { useMiniPickerContext } from "../context";

export function MiniPickerHeader() {
  const { path, setPath } = useMiniPickerContext();
  const backName = path[path.length - 1]?.name || "";
  return (
    <NavLink
      variant="mb-light"
      mb="sm"
      leftSection={<Icon name="chevronleft" />}
      label={backName}
      onClick={() => {
        setPath((prevPath) => prevPath.slice(0, -1));
      }}
    />
  );
}
