import { RETURN_TO_SETUP_GUIDE_PARAM } from "metabase/embedding/constants";
import { useSearchParams } from "metabase/router";
import { isSameOrSiteUrlOrigin } from "metabase/utils/dom";

const DEFAULT_SETUP_GUIDE_PATH = "/embedding/get-started";

/**
 * Where a setup wizard's back link should return to. The guide has more than
 * one host, so it names the one it is rendered in; the hub is the fallback.
 *
 * The value comes from the URL, so it is checked the way `getRedirectUrl` in
 * route-guards/redirect-target.ts checks the login `redirect` param: anything
 * off-origin would otherwise render as a working external link on an admin
 * page, and an empty value as a dead one.
 */
export function useSetupGuideReturnPath(): string {
  const [searchParams] = useSearchParams();
  const returnPath = searchParams.get(RETURN_TO_SETUP_GUIDE_PARAM);

  return returnPath && isSameOrSiteUrlOrigin(returnPath)
    ? returnPath
    : DEFAULT_SETUP_GUIDE_PATH;
}
