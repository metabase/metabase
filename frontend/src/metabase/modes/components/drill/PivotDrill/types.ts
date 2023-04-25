import { ClickActionPopoverProps } from "metabase/modes/types";

export type PivotByDrillOption = {
  title: string;
  icon: "string" | "location" | "calendar";
  popover: (props: ClickActionPopoverProps) => JSX.Element;
};
