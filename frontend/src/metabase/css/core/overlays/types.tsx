import { Dispatch, SetStateAction } from "react";

export type OverlaysDemoProps = {
  enableNesting: boolean;
  overlaysToOpen?: string[];
};

export type Setter = Dispatch<SetStateAction<number>>;
