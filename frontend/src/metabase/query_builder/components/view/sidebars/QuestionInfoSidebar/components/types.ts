import type { SearchModel } from "metabase-types/api";
import type { IconData } from "metabase/common/utils/icon";

export interface QuestionSource {
  href: string;
  name: string;
  model?: SearchModel;
  iconProps?: IconData;
}
