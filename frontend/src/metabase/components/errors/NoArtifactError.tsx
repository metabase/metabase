import { useSelector } from "metabase/lib/redux";
import { getNoSearchResultsIllustration } from "metabase/selectors/whitelabel";
import type { ImageProps } from "metabase/ui";
import { Image } from "metabase/ui";

export function NoArtifactError(props: ImageProps) {
  const noSearchResultsIllustration = useSelector(
    getNoSearchResultsIllustration,
  );

  return noSearchResultsIllustration ? (
    <Image
      width={120}
      height={120}
      src={noSearchResultsIllustration}
      {...props}
    />
  ) : null;
}
