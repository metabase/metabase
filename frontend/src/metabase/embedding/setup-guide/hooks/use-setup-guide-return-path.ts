import { RETURN_TO_SETUP_GUIDE_PARAM } from "metabase/embedding/constants";
import { useSearchParams } from "metabase/router";

const DEFAULT_SETUP_GUIDE_PATH = "/embedding/get-started";

/**
 * Where a setup wizard's back link should return to. The guide has more than
 * one host, so it names the one it is rendered in; the hub is the fallback.
 */
export function useSetupGuideReturnPath(): string {
  const [searchParams] = useSearchParams();

  return (
    searchParams.get(RETURN_TO_SETUP_GUIDE_PARAM) ?? DEFAULT_SETUP_GUIDE_PATH
  );
}
