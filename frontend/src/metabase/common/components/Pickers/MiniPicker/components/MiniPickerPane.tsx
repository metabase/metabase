import { Stack } from "metabase/ui";

import { useMiniPickerContext } from "../context";

import { MiniPickerFooter } from "./MiniPickerFooter";
import { MiniPickerHeader } from "./MiniPickerHeader";
import { MiniPickerItemList } from "./MiniPickerItemList";

export function MiniPickerPane({ className }: { className?: string }) {
  const { path, searchQuery, forceSearch } = useMiniPickerContext();

  const isRoot = path.length === 0;

  return (
    <Stack
      mah="30rem"
      w={searchQuery || forceSearch ? "40rem" : "20rem"}
      gap={0}
      className={className}
    >
      {!isRoot && !searchQuery && <MiniPickerHeader />}
      <MiniPickerItemList />
      {(isRoot || searchQuery) && <MiniPickerFooter />}
      {/* <pre>{JSON.stringify(path, null, 2)} </pre> */}
    </Stack>
  );
}
