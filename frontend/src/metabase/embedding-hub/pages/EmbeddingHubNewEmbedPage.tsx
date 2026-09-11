import { SdkIframeEmbedSetupModal } from "metabase/embedding/embedding-iframe-sdk-setup/components/SdkIframeEmbedSetupModal";
import type { SdkIframeEmbedSetupModalInitialState } from "metabase/plugins";
import { useLocation, useNavigate, useSearchParams } from "metabase/router";
import * as Urls from "metabase/urls";

/**
 * The wizard is a route rather than a modal dispatch so that opening it pushes a
 * history entry, and the browser back button closes it instead of leaving the
 * page it was opened from (EMB-2362).
 */
export function EmbeddingHubNewEmbedPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  // Closing pops the entry that opening pushed, so the wizard returns to
  // whichever page opened it. A direct visit has no entry to pop.
  const handleClose = () => {
    if (location.key === "default") {
      navigate(Urls.embeddingHubGetStarted());
    } else {
      navigate(-1);
    }
  };

  return (
    <SdkIframeEmbedSetupModal
      opened
      initialState={parseInitialState(searchParams)}
      onClose={handleClose}
    />
  );
}

function parseInitialState(
  searchParams: URLSearchParams,
): SdkIframeEmbedSetupModalInitialState {
  const resourceType = searchParams.get("resourceType");
  const resourceId = searchParams.get("resourceId");
  const isGuest = searchParams.get("isGuest");
  const useExistingUserSession = searchParams.get("useExistingUserSession");

  return {
    ...(resourceType != null && { resourceType }),
    ...(resourceId != null && { resourceId: parseResourceId(resourceId) }),
    ...(isGuest != null && { isGuest: isGuest === "true" }),
    ...(useExistingUserSession != null && {
      useExistingUserSession: useExistingUserSession === "true",
    }),
  };
}

// Callers pass numeric ids, which a URL flattens to strings. Entity ids are not
// numeric, so only an all-digit value converts back.
function parseResourceId(resourceId: string) {
  return /^\d+$/.test(resourceId) ? Number(resourceId) : resourceId;
}
