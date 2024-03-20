import type { ImageProps as MantineImageProps } from "@mantine/core";
import { Image as MantineImage } from "@mantine/core";
import type { CSSProperties } from "react";

export interface ImageProps extends MantineImageProps {
  position: CSSProperties["position"];
}

export function Image({ position, ...mantineImageProps }: ImageProps) {
  return (
    <MantineImage
      {...mantineImageProps}
      styles={{ image: { objectPosition: position } }}
    />
  );
}
