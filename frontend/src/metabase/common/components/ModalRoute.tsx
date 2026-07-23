import { useCallback } from "react";

import type { Location } from "metabase/router";
import {
  Route,
  useNavigate,
  useParams,
  useRoute,
  useRouter,
} from "metabase/router";
import { Modal, type ModalProps } from "metabase/ui";

type RouteParams = Record<string, string | undefined>;

/**
 * Base props any modal rendered by `modalRoute` must accept. Modals typically
 * narrow `params` to specific keys (e.g. `{ alertId?: string }`), but they have
 * to accept the full shape.
 */
export type ModalComponentProps = {
  params: RouteParams;
  location: Location;
  /**
   * The matched route, passed through only for `LeaveRouteConfirmModal`, which
   * hands it to react-router v3's `setRouteLeaveHook`. Do not use it to derive
   * URLs: `onClose` already returns to the parent page.
   */
  route?: Route;
  onClose: () => void;
};

type ModalRouteOptions = {
  /**
   * Render the modal component on its own instead of wrapping it in a `<Modal>`,
   * for components that bring their own overlay.
   */
  noWrap?: boolean;
  modalProps?: Partial<ModalProps>;
};

/**
 * Declare a modal as a child route of the page it opens over: the page stays
 * mounted underneath, and closing the modal returns to the page's URL.
 *
 * `onClose` is wired here rather than left to each modal, so no modal has to
 * work out its own parent URL.
 */
export function modalRoute(
  path: string,
  ComposedModal: React.ComponentType<ModalComponentProps>,
  { noWrap = false, modalProps }: ModalRouteOptions = {},
) {
  function ModalRouteComponent() {
    const params = useParams();
    // The raw v3 location (with `query`), which some modals still read.
    const { location } = useRouter();
    const route = useRoute() ?? undefined;
    const navigate = useNavigate();
    const onClose = useCallback(
      () => navigate("..", { relative: "route" }),
      [navigate],
    );

    const modal = (
      <ComposedModal
        params={params}
        location={location}
        route={route}
        onClose={onClose}
      />
    );

    if (noWrap) {
      return modal;
    }

    return (
      <Modal
        opened
        onClose={onClose}
        withCloseButton={false}
        padding={0}
        size="lg"
        {...modalProps}
      >
        {modal}
      </Modal>
    );
  }

  ModalRouteComponent.displayName = `ModalRoute[${
    ComposedModal.displayName || ComposedModal.name
  }]`;

  // Keyed for the plugin route arrays, which React renders as a list.
  return <Route key={path} path={path} element={<ModalRouteComponent />} />;
}
