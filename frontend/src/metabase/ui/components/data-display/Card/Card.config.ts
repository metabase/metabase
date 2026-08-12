import type { CardFactory } from "@mantine/core";

import { themeComponent } from "../../../utils/theme-component";

import CardStyles from "./Card.module.css";

export const cardOverrides = {
  Card: themeComponent<CardFactory>({
    classNames: {
      section: CardStyles.section,
    },
  }),
};
