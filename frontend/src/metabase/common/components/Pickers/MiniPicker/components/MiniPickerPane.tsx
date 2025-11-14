import { Stack } from "metabase/ui";

import { useMiniPickerContext } from "../context";

import { MiniPickerFooter } from "./MiniPickerFooter";
import { MiniPickerHeader } from "./MiniPickerHeader";
import { MiniPickerItemList } from "./MiniPickerItemList";

export function MiniPickerPane() {
  const { path } = useMiniPickerContext();

  const isRoot = path.length === 0;

  return (
    <Stack gap="sm" mah="30rem" w="20rem">
      {!isRoot && <MiniPickerHeader />}
      <MiniPickerItemList />
      {isRoot && <MiniPickerFooter />}
      {/* <pre>{JSON.stringify(path, null, 2)} </pre> */}
    </Stack>
  );
}

