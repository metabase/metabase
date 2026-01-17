import { Popover } from "metabase/common/components/Popover";
import { Triggerable } from "metabase/common/components/Triggerable";

/**
 * @deprecated prefer Popover from "metabase/ui" + useState instead
 */
export const PopoverWithTrigger = Triggerable(Popover);
