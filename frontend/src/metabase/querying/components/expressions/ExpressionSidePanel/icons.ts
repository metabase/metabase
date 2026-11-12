import ChevronDownIcon from "metabase/ui/components/icons/Icon/new-icons/chevron-down.svg?component";
import ChevronUpIcon from "metabase/ui/components/icons/Icon/new-icons/chevron-up.svg?component";
import ConvertIcon from "metabase/ui/components/icons/Icon/new-icons/convert.svg?component";
import DateIcon from "metabase/ui/components/icons/Icon/new-icons/date.svg?component";
import FunctionGeneralIcon from "metabase/ui/components/icons/Icon/new-icons/function-general.svg?component";
import MathIcon from "metabase/ui/components/icons/Icon/new-icons/math.svg?component";
import SearchIcon from "metabase/ui/components/icons/Icon/new-icons/search.svg?component";
import TableColumnIcon from "metabase/ui/components/icons/Icon/new-icons/table-column.svg?component";
import TableRowIcon from "metabase/ui/components/icons/Icon/new-icons/table-row.svg?component";
import TextIcon from "metabase/ui/components/icons/Icon/new-icons/text.svg?component";
import TimeIcon from "metabase/ui/components/icons/Icon/new-icons/time.svg?component";

import type { SidePanelIconName } from "./content";

export { ChevronDownIcon, ChevronUpIcon, SearchIcon };

export const SIDE_PANEL_ICONS: Record<SidePanelIconName, typeof ConvertIcon> = {
  convert: ConvertIcon,
  date: DateIcon,
  "function-general": FunctionGeneralIcon,
  math: MathIcon,
  "table-column": TableColumnIcon,
  "table-row": TableRowIcon,
  text: TextIcon,
  time: TimeIcon,
};
