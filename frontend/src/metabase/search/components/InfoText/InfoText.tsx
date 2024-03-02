import type { WrappedResult } from "metabase/search/types";
import { Group } from "metabase/ui";

import { InfoTextAssetLink } from "./InfoTextAssetLink";
import { InfoTextEditedInfo } from "./InfoTextEditedInfo";

type InfoTextProps = {
  result: WrappedResult;
  isCompact?: boolean;
  showLinks?: boolean;
};

export const InfoText = ({
  result,
  isCompact,
  showLinks = true,
}: InfoTextProps) => (
  <Group noWrap spacing="xs">
    <InfoTextAssetLink showLinks={showLinks} result={result} />
    <InfoTextEditedInfo result={result} isCompact={isCompact} />
  </Group>
);
