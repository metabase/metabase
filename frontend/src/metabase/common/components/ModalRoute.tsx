import { Suspense, useCallback, useEffect, useState } from "react";

import { LoadingSpinner } from "metabase/common/components/DelayedLoading/DelayedLoading";
import type { Location, RouteObject } from "metabase/router";
import { Route, useLocation, useNavigate, useParams } from "metabase/router";
import { Flex, Modal, type ModalProps } from "metabase/ui";

type RouteParams = Record<string, string | undefined>;

/**
 * Base props any modal rendered by `modalRoute` must accept. Modals typically
 * narrow `params` to specific keys (e.g. `{ alertId?: string }`), but they have
 * to accept the full shape.
 */
export type ModalComponentProps = {
  params: RouteParams;
  location: Location;
  onClose: () => void;
};

export type ModalComponent = React.ComponentType<ModalComponentProps>;

export type ModalRouteOptions = {
  /**
   * Render the modal component on its own instead of wrapping it in a `<Modal>`,
   * for components that bring their own overlay.
   */
  noWrap?: boolean;
  modalProps?: Partial<ModalProps>;
  closeTo?: string;
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
  ComposedModal: ModalComponent,
  options: ModalRouteOptions = {},
) {
  const ModalRouteComponent = createModalRouteComponent(ComposedModal, options);

  // Keyed for the plugin route arrays, which React renders as a list.
  return <Route key={path} path={path} element={<ModalRouteComponent />} />;
}

/**
 * `modalRoute` for a modal that lives in a code-split chunk, for a route tree
 * still authored as `<Route>` elements. `createRoutesFromElements` reads `lazy`
 * off the element, so this defers the modal without the tree having to convert.
 */
export function lazyModalRouteElement(
  path: string,
  loadModal: () => Promise<ModalComponent>,
  options: ModalRouteOptions = {},
) {
  return (
    <Route
      key={path}
      path={path}
      lazy={async () => ({
        Component: createModalRouteComponent(await loadModal(), options),
      })}
    />
  );
}

/**
 * `modalRoute` for a modal that lives in a code-split chunk.
 *
 * `route.lazy` cannot supply `children`, so a lazy page's modal children have to
 * be route objects of their own. This keeps the path static, which is what
 * matching needs, and defers only the modal itself.
 */
export function lazyModalRoute(
  path: string,
  loadModal: () => Promise<ModalComponent>,
  options: ModalRouteOptions = {},
): RouteObject {
  return {
    path,
    lazy: async () => ({
      Component: createModalRouteComponent(await loadModal(), options),
    }),
  };
}

// Long enough that a modal whose component is already loaded never flashes an
// empty shell, short enough that a slow connection does not read as a dead
// click.
const MODAL_LOADING_DELAY = 300;

/**
 * What a modal route shows while its component is still loading.
 *
 * Nothing at first, so the common case of an already-loaded modal opens
 * straight onto its content. If the wait runs long, the modal opens on a
 * spinner rather than leaving the click with no answer at all.
 */
function LoadingModal({
  onClose,
  modalProps,
}: {
  onClose: () => void;
  modalProps?: Partial<ModalProps>;
}) {
  const [hasWaited, setHasWaited] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setHasWaited(true), MODAL_LOADING_DELAY);
    return () => clearTimeout(timeout);
  }, []);

  if (!hasWaited) {
    return null;
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
      <Flex
        p="xl"
        mih="10rem"
        align="center"
        justify="center"
        data-testid="modal-loading"
      >
        <LoadingSpinner />
      </Flex>
    </Modal>
  );
}

export function createModalRouteComponent(
  ComposedModal: ModalComponent,
  { noWrap = false, modalProps, closeTo = ".." }: ModalRouteOptions,
) {
  function ModalRouteComponent() {
    const params = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const onClose = useCallback(
      () => navigate(closeTo, { relative: "route" }),
      [navigate],
    );

    const modal = (
      <ComposedModal params={params} location={location} onClose={onClose} />
    );

    // The boundary sits outside the `Modal`, not inside it, so a modal whose
    // component is in another chunk stays closed until that chunk arrives
    // rather than opening on an empty box. A modal that is already loaded never
    // suspends, so this changes nothing for the rest of them.
    //
    // A modal that brings its own overlay gets no fallback: there is no way to
    // stand in for chrome this module cannot see.
    if (noWrap) {
      return <Suspense fallback={null}>{modal}</Suspense>;
    }

    return (
      <Suspense
        fallback={<LoadingModal onClose={onClose} modalProps={modalProps} />}
      >
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
      </Suspense>
    );
  }

  ModalRouteComponent.displayName = `ModalRoute[${
    ComposedModal.displayName || ComposedModal.name
  }]`;

  return ModalRouteComponent;
}
