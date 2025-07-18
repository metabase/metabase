import type { DataAppWidgetType } from "../canvas-types";

import { ButtonWidget } from "./Button";
import { SectionWidget } from "./Section";
import { TextWidget } from "./Text";

export const WIDGET_COMPONENTS_MAP: Record<DataAppWidgetType, any> = {
  section: SectionWidget,
  button: ButtonWidget,
  text: TextWidget,
};
