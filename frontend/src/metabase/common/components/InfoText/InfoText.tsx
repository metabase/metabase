import { Group } from "metabase/ui";
import type { SearchResult } from "metabase-types/api";

import { InfoTextAssetLink } from "./InfoTextAssetLink";
import { InfoTextEditedInfo } from "./InfoTextEditedInfo";

type InfoTextProps = {
  result: SearchResult;
  isCompact?: boolean;
  showLinks?: boolean;
};

export const InfoText = ({
  result,
  isCompact,
  showLinks = true,
}: InfoTextProps) => (
  <Group wrap="nowrap" gap="xs">
    <InfoTextAssetLink showLinks={showLinks} result={result} />
    <InfoTextEditedInfo result={result} isCompact={isCompact} />
  </Group>
);
