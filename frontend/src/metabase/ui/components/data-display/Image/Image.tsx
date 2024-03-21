import { Image as MantineImage } from "@mantine/core";

import type { ImageProps } from "./index";

export function Image({ position, ...mantineImageProps }: ImageProps) {
  return (
    <MantineImage
      {...mantineImageProps}
      styles={{ image: { objectPosition: position } }}
    />
  );
}
