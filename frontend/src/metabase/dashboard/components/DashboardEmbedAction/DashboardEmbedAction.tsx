import { useState } from "react";
import type { Dashboard } from "metabase-types/api";
import { DashboardEmbedHeaderButton } from "metabase/dashboard/components/DashboardEmbedHeaderButton";
import { DashboardEmbedHeaderMenu } from "metabase/dashboard/components/DashboardEmbedHeaderMenu";
import DashboardSharingEmbeddingModal from "metabase/dashboard/containers/DashboardSharingEmbeddingModal";
import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Popover } from "metabase/ui";

export type EmbedButtonClickBehavior =
  | "embed-menu"
  | "embed-modal"
  | "public-link-popover"
  | null;

const getClickBehavior = ({
  isAdmin,
  isPublicSharingEnabled,
  hasPublicLink,
}: {
  isAdmin: boolean;
  isPublicSharingEnabled: boolean;
  hasPublicLink: boolean;
}): EmbedButtonClickBehavior => {
  if (!isPublicSharingEnabled) {
    return isAdmin ? "embed-modal" : null;
  }

  if (isAdmin) {
    return "embed-menu";
  }

  if (hasPublicLink) {
    return "public-link-popover";
  }

  return null;
};

export const DashboardEmbedAction = ({
  dashboard,
}: {
  dashboard: Dashboard;
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const isPublicSharingEnabled = useSelector(state =>
    getSetting(state, "enable-public-sharing"),
  );
  const isAdmin = useSelector(getUserIsAdmin);

  const hasPublicLink = !!dashboard.public_uuid;

  const originalClickBehavior = getClickBehavior({
    isAdmin,
    isPublicSharingEnabled,
    hasPublicLink,
  });

  const [clickBehavior, setClickBehavior] = useState<EmbedButtonClickBehavior>(
    originalClickBehavior,
  );

  const resetClickBehavior = () => {
    setClickBehavior(originalClickBehavior);
  };

  const props = {
    onClick: () => setIsOpen(true),
    hasPublicLink,
  };

  const getEmbedElement = (clickBehavior: EmbedButtonClickBehavior) => {
    if (clickBehavior === "embed-modal") {
      return (
        <>
          <DashboardEmbedHeaderButton {...props} />
          {isOpen && (
            <DashboardSharingEmbeddingModal
              key="dashboard-embed"
              dashboard={dashboard}
              enabled={isOpen}
              onClose={() => {
                resetClickBehavior();
                setIsOpen(false);
              }}
              isLinkEnabled={true}
            />
          )}
        </>
      );
    }
    if (clickBehavior === "embed-menu") {
      return (
        <DashboardEmbedHeaderMenu
          {...props}
          openPublicLinkPopover={() => {
            setIsOpen(true);
            setClickBehavior("public-link-popover");
          }}
          openEmbedModal={() => {
            setIsOpen(true);
            setClickBehavior("embed-modal");
          }}
          target={
            <div>
              <DashboardEmbedHeaderButton />
            </div>
          }
        />
      );
    }
    if (clickBehavior === "public-link-popover") {
      return (
        <Popover onClose={resetClickBehavior}>
          <Popover.Target>
            <div>
              <DashboardEmbedHeaderButton />
            </div>
          </Popover.Target>
          <Popover.Dropdown>
            <div>popover</div>
          </Popover.Dropdown>
        </Popover>
      );
    }

    return null;
  };

  return getEmbedElement(clickBehavior);
};
