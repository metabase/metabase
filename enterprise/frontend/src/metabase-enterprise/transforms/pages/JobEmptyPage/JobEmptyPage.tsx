import { NoDataError } from "metabase/common/components/errors/NoDataError";
import { Center } from "metabase/ui";

export function JobEmptyPage() {
  return (
    <Center w="100%" h="100%">
      <NoDataError />
    </Center>
  );
}
