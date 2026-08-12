import type { AccordionFactory } from "@mantine/core";

import { themeComponent } from "../../../utils/theme-component";

import AccordionStyles from "./Accordion.module.css";

export const accordionOverrides = {
  Accordion: themeComponent<AccordionFactory>({
    classNames: {
      control: AccordionStyles.control,
      label: AccordionStyles.label,
      item: AccordionStyles.item,
      content: AccordionStyles.content,
      chevron: AccordionStyles.chevron,
      panel: AccordionStyles.panel,
    },
  }),
};
