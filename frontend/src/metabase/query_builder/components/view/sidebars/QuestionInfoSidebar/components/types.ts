import { IconData } from "metabase/lib/icon";
import { IconProps } from "metabase/ui";

export interface QuestionSource {
  href: string;
  name: string;
  model?: string;
  iconProps?: IconData;
}
