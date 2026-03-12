import type { IconData } from "metabase/lib/icon";
import type { SearchModel } from "metabase-types/api";

export interface QuestionSource {
  href: string;
  name: string;
  model?: SearchModel;
  iconProps?: IconData;
}
