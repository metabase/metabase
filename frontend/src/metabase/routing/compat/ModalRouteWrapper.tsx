import type { ComponentType } from "react";
import { useNavigate, useLocation } from "react-router-dom";

import Modal from "metabase/common/components/Modal";
import MetabaseSettings from "metabase/lib/settings";

interface ComposedModalProps {
  onClose: () => void;
  [key: string]: unknown;
}

interface ModalRouteWrapperProps {
  /**
   * The modal component to render
   */
  modal: ComponentType<ComposedModalProps>;
  /**
   * Additional props to pass to the Modal container
   */
  modalProps?: Record<string, unknown>;
  /**
   * If true, render the modal component directly without the Modal wrapper
   */
  noWrap?: boolean;
}

/**
 * Calculate the parent path for modal close navigation.
 *
 * This replicates the logic from the v3 ModalRoute.tsx to ensure
 * consistent close behavior during migration.
 *
 * @param currentPath - The current location pathname
 * @param modalPath - The modal route path (e.g., "move", "archive")
 */
function getParentPath(currentPath: string, modalPath?: string): string {
  // Handle custom site URL subpath
  const siteUrlSegments = (MetabaseSettings.get("site-url") ?? "").split("/");
  const subPath = siteUrlSegments.slice(3).join("/");

  let pathName: string;
  if (subPath) {
    const subPathSplit = currentPath.split(subPath);
    pathName =
      subPathSplit.length === 1
        ? subPathSplit[0]
        : subPathSplit.slice(1).join(subPath);
  } else {
    pathName = currentPath;
  }

  // Remove the modal segment from the path
  const segments = pathName.split("/").filter(Boolean);

  // Remove the last segment (the modal path)
  if (segments.length > 0) {
    segments.pop();
  }

  return "/" + segments.join("/");
}

/**
 * React Router v7 compatible wrapper for modal routes.
 *
 * This component wraps a modal component and provides:
 * - Automatic close navigation (navigates to parent path when modal is closed)
 * - Optional Modal container wrapping
 * - Props passthrough to the modal component
 *
 * Usage in route config:
 * ```tsx
 * {
 *   path: "move",
 *   element: <ModalRouteWrapper modal={MoveCollectionModal} noWrap />
 * }
 * ```
 *
 * The component uses `useNavigate` from react-router-dom v7 for navigation.
 * When the modal is closed, it navigates to the parent route.
 */
export function ModalRouteWrapper({
  modal: ModalComponent,
  modalProps = {},
  noWrap = false,
}: ModalRouteWrapperProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleClose = () => {
    const parentPath = getParentPath(location.pathname);
    navigate(parentPath);
  };

  if (noWrap) {
    return <ModalComponent {...modalProps} onClose={handleClose} />;
  }

  return (
    <Modal {...modalProps} onClose={handleClose}>
      <ModalComponent {...modalProps} onClose={handleClose} />
    </Modal>
  );
}

/**
 * Helper function to create a modal route object for v7 route config.
 *
 * Usage:
 * ```tsx
 * const routes = [
 *   {
 *     path: "collection/:slug",
 *     element: <CollectionLanding />,
 *     children: [
 *       createModalRoute("move", MoveCollectionModal, { noWrap: true }),
 *       createModalRoute("archive", ArchiveCollectionModal, { noWrap: true }),
 *     ],
 *   },
 * ];
 * ```
 */
export function createModalRoute(
  path: string,
  modal: ComponentType<ComposedModalProps>,
  options: { modalProps?: Record<string, unknown>; noWrap?: boolean } = {},
) {
  return {
    path,
    element: (
      <ModalRouteWrapper
        modal={modal}
        modalProps={options.modalProps}
        noWrap={options.noWrap}
      />
    ),
  };
}
