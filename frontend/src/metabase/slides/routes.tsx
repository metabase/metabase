import type { ComponentProps } from "react";

import { Presenter } from "./components/Presenter/Presenter";
import { SlidesBrowse } from "./components/SlidesBrowse/SlidesBrowse";
import { SlidesPage } from "./components/SlidesPage/SlidesPage";

export { SlidesBrowse };

export const SlidesPageOuter = (props: ComponentProps<typeof SlidesPage>) => {
  // Remount the editor when the deck id changes so editor state, slice and
  // undo history don't bleed across decks.
  return <SlidesPage key={props.params.entityId} {...props} />;
};

export const SlidesPresenterOuter = (
  props: ComponentProps<typeof Presenter>,
) => {
  return <Presenter key={props.params.entityId} {...props} />;
};
