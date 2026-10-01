import { t } from "ttag";

import { Flex, Icon, rem } from "metabase/ui";
import type { Collection } from "metabase-types/api";

import S from "./UploadOverlay.module.css";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function UploadOverlay({
  isDragActive,
  collection,
}: {
  isDragActive: boolean;
  collection: Collection;
}) {
  return (
    <Flex
      className={S.overlay}
      pos="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      direction="column"
      justify="center"
      align="center"
      gap="lg"
      mx="4%"
      my="sm"
      p={rem(64)}
      bdrs="sm"
      bg="background_surface-brand-subtle"
      c="core-brand"
      fz="lg"
      fw="bold"
      opacity={isDragActive ? 0.9 : 0}
    >
      <Icon name="upload" size="24" />
      <div>{t`Drop here to upload to ${collection.name}`}</div>
    </Flex>
  );
}
