import { Image as MantineImage } from "@mantine/core";

import type { ImageProps } from "./index";

export function Image({ position, ...mantineImageProps }: ImageProps) {
  return (
    <MantineImage
      {...mantineImageProps}
      // eslint-disable-next-line react/forbid-component-props
      styles={{ image: { objectPosition: position } }}
    />
  );
}
