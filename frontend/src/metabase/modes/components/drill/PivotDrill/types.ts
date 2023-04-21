import { ClickActionPopoverProps } from "metabase/modes/types";

export type PivotByDrillOption = {
  title: string;
  icon: string;
  popover: (props: ClickActionPopoverProps) => JSX.Element;
};
