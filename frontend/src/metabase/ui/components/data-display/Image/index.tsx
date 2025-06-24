import type { ImageProps as MantineImageProps } from "@mantine/core";

export interface ImageProps extends MantineImageProps {
  position?: React.CSSProperties["position"];
  alt?: string;
}

export { Image } from "./Image";
