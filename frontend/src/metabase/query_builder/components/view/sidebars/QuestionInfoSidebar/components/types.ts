import type { IconData } from "metabase/lib/icon";

export interface QuestionSource {
  href: string;
  name: string;
  model?: string;
  iconProps?: IconData;
}
