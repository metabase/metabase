import type { ImageProps as MantineImageProps } from "@mantine/core";
import type { CSSProperties } from "react";

export interface ImageProps extends MantineImageProps {
  position?: CSSProperties["position"];
}

export { Image } from "./Image";
